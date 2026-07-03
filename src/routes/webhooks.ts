import { Router } from 'express';
import { db } from '../db/index.js';
import { users, coldEmails, outreachTargets, interviews } from '../db/schema.js';
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
        let sentiment = 'negative';
        let date_time = new Date().toISOString();
        let platform = 'Other';
        let link = '';

        if (process.env.GROQ_API_KEY) {
          try {
            const prompt = `You are an HR email analyzer. Analyze this HR email reply and determine if it is a positive possibility (scheduling an interview, next steps, selected) or negative (rejection, not selected).

Email: "${fullBody}"

You MUST respond in strict JSON format exactly like this example:
{
  "sentiment": "positive" or "negative",
  "dateTime": "ISO 8601 string if an interview date is proposed, else null",
  "platform": "Google Meet, Zoom, Teams, or Other if positive, else null",
  "link": "meeting link if present, else null"
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

            sentiment = (result.sentiment || result.Sentiment || 'negative').toLowerCase();
            if (sentiment !== 'positive') sentiment = 'negative'; // Strict binary

            if (result.dateTime || result.DateTime) date_time = result.dateTime || result.DateTime;
            if (result.platform || result.Platform) platform = result.platform || result.Platform;
            if (result.link || result.Link) link = result.link || result.Link;

            console.log(`[Webhook] Groq AI determined sentiment: ${sentiment}`);
          } catch (e) { console.error("Groq AI parse error", e); }
        } else {
          // Fallback keyword mock logic
          const lowerBody = fullBody.toLowerCase();
          if (lowerBody.includes('interview') || lowerBody.includes('next steps') || lowerBody.includes('schedule')) {
            sentiment = 'positive';
            date_time = new Date(Date.now() + 86400000).toISOString(); // tomorrow
          } else {
            sentiment = 'negative';
          }
        }

        if (matchedEmail.targetId) {
          await db.update(outreachTargets)
            .set({
              status: sentiment === 'positive' ? 'replied_positive' : (sentiment === 'negative' ? 'replied_negative' : 'replied'),
              responseSentiment: sentiment,
              replyBody: fullBody,
              updatedAt: new Date()
            })
            .where(eq(outreachTargets.id, matchedEmail.targetId));
          console.log(`[Webhook] Successfully updated target ${matchedEmail.targetId} in the database (Sentiment: ${sentiment}).`);

          if (sentiment === 'positive') {
            console.log(`[Webhook] Positive reply detected! Scheduling interview for target ${matchedEmail.targetId}...`);
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
