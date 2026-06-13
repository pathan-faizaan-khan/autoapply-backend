import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import authRoutes from './src/routes/auth.js';
import resumeRoutes from './src/routes/resumes.js';
import jobsRoutes from './src/routes/jobs.js';
import outreachRoutes from './src/routes/outreach.js';
import { authenticateToken } from './src/middleware/auth.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/outreach', outreachRoutes);

// Example protected route
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is protected data', user: (req as any).user });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
