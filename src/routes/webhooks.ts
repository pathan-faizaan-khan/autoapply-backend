import { Router } from 'express';
import { db } from '../db/index.js';
import { users, coldEmails, outreachTargets, interviews, selections } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

// Helper to extract full plain text from Gmail payload
function extractPlainText(payload: any): string {
  if (!payload) return "";
  let body = "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, 'base64url').toString('utf-8');
      } else if (part.parts) {
        const nested = extractPlainText(part);
        if (nested) return nested;
      }
    }
  }
  return body;
}

const router = Router();

// POST /api/webhooks/gmail — Google Cloud Pub/Sub Push Endpoint
router.post('/gmail', async (req: any, res) => {
  try {
    const message = req.body.message;
    if (!message || !message.data) return res.status(400).send('Bad Request');

    // Decode Pub/Sub message data (base64)
    const decodedData = Buffer.from(message.data, 'base64').toString('utf-8');
    const { emailAddress, historyId } = JSON.parse(decodedData);

    if (!emailAddress || !historyId) return res.status(400).send('Bad Request');

    console.log(`[Webhook] Received push notification for ${emailAddress} with historyId: ${historyId}`);

    // 1. Look up the user by emailAddress
    const [user] = await db.select().from(users).where(eq(users.email, emailAddress));
    if (!user || !user.googleRefreshToken) {
      console.warn(`Webhook received for ${emailAddress}, but user or refresh token not found.`);
      return res.status(200).send('OK'); // Acknowledge to Pub/Sub to avoid retries
    }

    // 2. Fetch new access token using the refresh token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: user.googleRefreshToken,
        grant_type: 'refresh_token',
      }).toString()
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error(`Failed to refresh token for ${emailAddress}`);
      return res.status(200).send('OK');
    }
    const accessToken = tokenData.access_token;

    // 3. Fetch history list to see what messages were added since the last historyId
    const startHistoryId = user.gmailHistoryId || (BigInt(historyId) - 1000n).toString(); // Fallback if no history
    const historyRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const historyData = await historyRes.json();

    if (!historyData.history) {
      console.log(`[Webhook] No new history found for ${emailAddress} since ${startHistoryId}. Silently exiting.`);
      // Update the user's history ID and exit
      await db.update(users).set({ gmailHistoryId: historyId.toString() }).where(eq(users.id, user.id));
      return res.status(200).send('OK');
    }

    // 4. Fetch the sent emails to match against
    const sentEmails = await db.select({
      emailId: coldEmails.id,
      targetId: coldEmails.targetId,
      subject: coldEmails.subject,
      contactEmail: outreachTargets.contactEmail,
      company: outreachTargets.companyName,
      role: outreachTargets.jobTitle
    })
      .from(coldEmails)
      .leftJoin(outreachTargets, eq(coldEmails.targetId, outreachTargets.id))
      .where(and(eq(coldEmails.userId, user.id), eq(coldEmails.status, 'sent')));

    // 5. Process newly added messages
    console.log(`[Webhook] Found ${historyData.history.length} history records to process.`);
    for (const record of historyData.history) {
      if (!record.messagesAdded) {
        console.log(`[Webhook] Record does not contain messagesAdded. Skipping.`);
        continue;
      }

      for (const added of record.messagesAdded) {
        const msgId = added.message.id;
        console.log(`[Webhook] Fetching full message for ID: ${msgId}`);

        // Fetch full message
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const msgData = await msgRes.json();

        const headers = msgData.payload?.headers || [];
        const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';

        // Match logic
        const matchedEmail = sentEmails.find(se =>
          (se.contactEmail && fromHeader.includes(se.contactEmail)) ||
          (se.subject && subjectHeader.replace(/^(Re|Fwd):\s*/i, '').trim() === se.subject?.trim())
        );

        if (!matchedEmail) {
          console.log(`[Webhook] Message ${msgId} (From: ${fromHeader}, Subject: ${subjectHeader}) did not match any sent cold emails. Skipping.`);
          continue;
        }
        console.log(`[Webhook] Matched reply from ${fromHeader} for target ${matchedEmail.targetId}`);

        const bodySnippet = msgData.snippet || '';
        const fullBody = extractPlainText(msgData.payload) || bodySnippet;
        
        console.log(`[Webhook] Email Body sent to AI: "${fullBody.substring(0, 100)}..."`);
        let emailType: 'interview_invite' | 'job_offer' | 'rejection' = 'rejection';
        let date_time = new Date().toISOString();
        let platform = 'Other';
        let link = '';

        if (process.env.GROQ_API_KEY) {
          try {
            const prompt = `You are an expert HR email classifier. Carefully read this email reply and classify it into EXACTLY ONE of three categories:

1. "interview_invite" — The recruiter is scheduling a job interview, asking for availability, or inviting to a screening/technical round.
2. "job_offer" — This is a formal job offer or final selection email. Keywords: "offer letter", "pleased to offer", "joining date", "compensation package", "CTC", "welcome to the team", "we'd like to extend an offer", "you have been selected for the position".
3. "rejection" — The candidate was not selected or the role is no longer available.

Email:
"""${fullBody}"""

You MUST respond in strict JSON format:
{
  "type": "interview_invite" or "job_offer" or "rejection",
  "dateTime": "ISO 8601 string if interview is being scheduled, else null",
  "platform": "Google Meet, Zoom, Teams, Phone, or Other if interview_invite, else null",
  "link": "meeting/interview link if present, else null"
}`;

            const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }]
              })
            });

            const aiData = await aiResponse.json();
            if (!aiResponse.ok) {
              console.error("[Webhook] Groq API Error:", aiData);
              throw new Error(`Groq API returned ${aiResponse.status}`);
            }

            const resultText = aiData.choices?.[0]?.message?.content || '{}';
            console.log(`[Webhook] Raw AI Output: ${resultText}`);
            
            const cleanText = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const result = JSON.parse(cleanText);

            const rawType = (result.type || result.Type || '').toLowerCase();
            if (rawType === 'interview_invite') emailType = 'interview_invite';
            else if (rawType === 'job_offer') emailType = 'job_offer';
            else emailType = 'rejection';

            if (result.dateTime || result.DateTime) date_time = result.dateTime || result.DateTime;
            if (result.platform || result.Platform) platform = result.platform || result.Platform;
            if (result.link || result.Link) link = result.link || result.Link;

            console.log(`[Webhook] Groq AI classified email as: ${emailType}`);
          } catch (e) { console.error("Groq AI parse error", e); }
        } else {
          // Fallback keyword logic
          const lowerBody = fullBody.toLowerCase();
          if (lowerBody.includes('offer letter') || lowerBody.includes('pleased to offer') || lowerBody.includes('joining date') || lowerBody.includes('welcome to the team') || lowerBody.includes('compensation')) {
            emailType = 'job_offer';
          } else if (lowerBody.includes('interview') || lowerBody.includes('schedule') || lowerBody.includes('availability') || lowerBody.includes('next steps')) {
            emailType = 'interview_invite';
          } else {
            emailType = 'rejection';
          }
        }

        if (matchedEmail.targetId) {
          // Determine new status and sentiment based on email type
          let newStatus: string;
          if (emailType === 'interview_invite') newStatus = 'replied_positive';
          else if (emailType === 'job_offer') newStatus = 'selected';
          else newStatus = 'replied_negative';

          await db.update(outreachTargets)
            .set({
              status: newStatus,
              responseSentiment: emailType === 'rejection' ? 'negative' : 'positive',
              replyBody: fullBody,
              updatedAt: new Date()
            })
            .where(eq(outreachTargets.id, matchedEmail.targetId));
          console.log(`[Webhook] Updated target ${matchedEmail.targetId} → status: ${newStatus}`);

          if (emailType === 'interview_invite') {
            // Schedule interview round
            console.log(`[Webhook] Interview invite detected! Creating interview entry for target ${matchedEmail.targetId}...`);
            await db.insert(interviews).values({
              userId: user.id,
              targetId: matchedEmail.targetId,
              company: matchedEmail.company || 'Unknown',
              role: matchedEmail.role || 'Unknown',
              dateTime: new Date(date_time),
              platform,
              link,
              status: 'scheduled'
            });
            console.log(`[Webhook] Interview entry created for ${matchedEmail.company}`);

          } else if (emailType === 'job_offer') {
            // Save offer letter to selections table
            console.log(`[Webhook] Job offer detected! Saving to selections table for target ${matchedEmail.targetId}...`);
            await db.insert(selections).values({
              userId: user.id,
              targetId: matchedEmail.targetId,
              coldEmailId: matchedEmail.emailId,
              company: matchedEmail.company || 'Unknown',
              role: matchedEmail.role || null,
              offerBody: fullBody,
              recruiterName: fromHeader.replace(/<.*>/, '').trim() || null,
              recruiterEmail: fromHeader.match(/<(.+)>/)?.[1] || fromHeader.trim() || null,
              receivedAt: new Date(),
            });
            console.log(`[Webhook] Selection/offer saved for ${matchedEmail.company}`);
          } else {
            console.log(`[Webhook] Rejection detected for target ${matchedEmail.targetId}`);
          }
        }
      }
    }

    // 6. Update user history ID
    await db.update(users).set({ gmailHistoryId: historyId.toString() }).where(eq(users.id, user.id));

    res.status(200).send('OK'); // Always return 200 OK so Pub/Sub doesn't retry
  } catch (err) {
    console.error("Webhook processing error:", err);
    res.status(500).send('Internal Server Error');
  }
});

export default router;
