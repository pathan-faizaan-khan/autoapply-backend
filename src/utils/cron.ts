import cron from 'node-cron';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { isNotNull, eq, and, lt } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';

export function startCronJobs() {
  // ─── Daily Gmail Watch Renewal ── runs at midnight UTC ───────────────────
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
            console.error(`[Cron] Could not get access token for user ${user.email}`);;
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

  // ─── Guest User Cleanup ── runs at 1 AM UTC daily ─────────────────────────
  // Deletes guest accounts (isGuest = true) older than 24 hours.
  // Child records (resumes, applications, etc.) are cascade-deleted by the DB.
  cron.schedule('0 1 * * *', async () => {
    console.log('[Cron] Running guest user cleanup task...');
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

      const deleted = await db
        .delete(users)
        .where(
          and(
            eq(users.isGuest, true),
            lt(users.createdAt, cutoff)
          )
        )
        .returning({ id: users.id, email: users.email });

      if (deleted.length > 0) {
        console.log(`[Cron] Cleaned up ${deleted.length} expired guest account(s).`);
      } else {
        console.log('[Cron] No expired guest accounts to clean up.');
      }
    } catch (err) {
      console.error('[Cron] Fatal error in guest cleanup task:', err);
    }
  });

  console.log('[Cron] Daily Gmail watch renewal + guest cleanup cron jobs initialized.');
}
