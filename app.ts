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
import { authenticateToken } from './src/middleware/auth.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/resumes', authenticateToken, resumeRoutes);
app.use('/api/jobs', authenticateToken, jobsRoutes);
app.use('/api/outreach', authenticateToken, outreachRoutes);
app.use('/api/interviews', authenticateToken, interviewsRoutes);
app.use('/api/extension', authenticateToken, extensionRoutes);
app.use('/api/webhooks', webhookRoutes); // Public endpoint for Pub/Sub

import profileRoutes from './src/routes/profile.js';
app.use('/api/profile', authenticateToken, profileRoutes);

import { startCronJobs } from './src/utils/cron.js';
startCronJobs();

// Example protected route
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is protected data', user: (req as any).user });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
