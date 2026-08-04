import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import authRoutes from './src/routes/auth.js';
import resumeRoutes from './src/routes/resumes.js';
import jobsRoutes from './src/routes/jobs.js';
import outreachRoutes from './src/routes/outreach.js';
import interviewsRoutes from './src/routes/interviews.js';
import webhookRoutes from './src/routes/webhooks.js';
import extensionRoutes from './src/routes/extension.js';
import careerRoutes from './src/routes/career.js';
import { authenticateToken } from './src/middleware/auth.js';
import { guestGuard, guestMutationGuard } from './src/middleware/guestGuard.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// ─── Public routes (no auth) ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/webhooks', webhookRoutes); // Public endpoint for Pub/Sub

// ─── Auth-required routes (with selective guest guards) ────────────────────
// Guests CAN browse jobs (GET) but CANNOT apply/save (POST/PUT/DELETE)
app.use('/api/jobs', authenticateToken, guestMutationGuard, jobsRoutes);

// Guests CANNOT upload/manage resumes — full block on all methods
app.use('/api/resumes', authenticateToken, guestGuard, resumeRoutes);

// Guests CANNOT create outreach campaigns or send emails
app.use('/api/outreach', authenticateToken, guestGuard, outreachRoutes);

// Guests CAN browse interview records (read) but not create
app.use('/api/interviews', authenticateToken, guestMutationGuard, interviewsRoutes);

// Chrome extension routes — no guest access (extension not in scope)
app.use('/api/extension', authenticateToken, extensionRoutes);

// Career & profile — read access for guests, block mutations
app.use('/api/career', authenticateToken, careerRoutes);

import profileRoutes from './src/routes/profile.js';
// Guests CANNOT modify their profile
app.use('/api/profile', authenticateToken, guestGuard, profileRoutes);


import { startCronJobs } from './src/utils/cron.js';
import { wakeUpMlBackend } from './src/utils/mlWakeup.js';
startCronJobs();

// Example protected route
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is protected data', user: (req as any).user });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  // Wake up the ML backend (Render free-tier cold-start)
  // Fire-and-forget — non-blocking, retries in background
  wakeUpMlBackend();
});
