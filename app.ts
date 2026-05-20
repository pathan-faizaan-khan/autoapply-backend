import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import authRoutes from './src/routes/auth.js';
import { authenticateToken } from './src/middleware/auth.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

// Example protected route
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is protected data', user: (req as any).user });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
