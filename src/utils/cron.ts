import cron from 'node-cron';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { isNotNull, eq } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';

export function startCronJobs() {
  // Run daily at midnight: 0 0 * * *
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running daily Gmail watch renewal task...');
    try {
      // Find all users who have a refresh token
      const connectedUsers = await db
        .select()
        .from(users)
        .where(isNotNull(users.googleRefreshToken));

      for (const user of connectedUsers) {
        if (!user.googleRefreshToken) continue;
        
        try {
          const oauth2Client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
          );
          oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
          
          // This automatically generates a fresh access token using the refresh token
          const { token: access_token } = await oauth2Client.getAccessToken();
          
          if (!access_token) {
            console.error(`[Cron] Could not get access token for user ${user.email}`);
            continue;
          }

          // Renew the Gmail watch
          const watchRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              topicName: process.env.PUBSUB_TOPIC_NAME || 'projects/your-gcp-project/topics/gmail-webhooks',
              labelIds: ['INBOX'],
              labelFilterAction: 'include'
            })
          });
          
          const watchData = await watchRes.json();
          if (watchRes.ok) {
            await db.update(users).set({ gmailHistoryId: watchData.historyId.toString() }).where(eq(users.id, user.id));
            console.log(`[Cron] Successfully renewed watch for ${user.email}`);
          } else {
            console.error(`[Cron] Failed to renew watch for ${user.email}:`, watchData);
          }
        } catch (e) {
          console.error(`[Cron] Error renewing watch for user ${user.email}:`, e);
        }
      }
    } catch (err) {
      console.error('[Cron] Fatal error in daily watch renewal task:', err);
    }
  });

  console.log('[Cron] Daily Gmail watch renewal cron job initialized.');
}
