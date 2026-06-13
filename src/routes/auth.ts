import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import nodemailer from 'nodemailer';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, otps } from '../db/schema.js';

const router = Router();
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Helper to generate 6-digit OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;
    
    // Check if user exists
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length > 0) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create unverified user
    await db.insert(users).values({
      email,
      passwordHash: hashedPassword,
      name,
      isVerified: false,
    });

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP
    await db.insert(otps).values({ email, code, expiresAt });

    // Send Email via Nodemailer
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      try {
        await transporter.sendMail({
          from: `"AutoApply" <${process.env.GMAIL_USER}>`,
          to: email,
          subject: 'Your Verification Code',
          html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
        });
      } catch (emailError) {
        console.error("Nodemailer failed to send email:", emailError);
        res.status(500).json({ error: 'Failed to send verification email' });
        return;
      }
    } else {
      console.log(`Mock OTP for ${email}: ${code}`);
    }

    res.status(200).json({ message: 'OTP sent to email' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/verify-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code } = req.body;

    const otpRecords = await db.select().from(otps).where(eq(otps.email, email)).orderBy(otps.createdAt); // We want the latest, actually drizzle-orm doesn't have a simple order by in this syntax without full desc
    // Filter the latest otp
    const latestOtp = otpRecords.reverse().find(o => o.code === code);

    if (!latestOtp || latestOtp.expiresAt < new Date()) {
       res.status(400).json({ error: 'Invalid or expired OTP' });
       return;
    }

    const userRecords = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (userRecords.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const user = userRecords[0];

    // Mark verified
    await db.update(users).set({ isVerified: true }).where(eq(users.id, user.id));
    
    // Clean up OTP
    await db.delete(otps).where(eq(otps.email, email));

    // Generate JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.status(200).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const userRecords = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (userRecords.length === 0) {
      res.status(400).json({ error: 'Invalid credentials' });
      return;
    }
    const user = userRecords[0];

    if (!user.passwordHash) {
      res.status(400).json({ error: 'Please login using Google' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(400).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.isVerified) {
      res.status(403).json({ error: 'Email not verified. Please request a new OTP.' });
      return;
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(200).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/google', async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential } = req.body;
    
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      res.status(400).json({ error: 'Invalid Google token' });
      return;
    }

    const { email, name, sub: googleId } = payload;
    if (!email) {
      res.status(400).json({ error: 'No email found in Google token' });
      return;
    }

    let userRecords = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let user;

    if (userRecords.length === 0) {
      const inserted = await db.insert(users).values({
        email,
        name: name || '',
        googleId,
        isVerified: true, // Google emails are already verified
      }).returning();
      user = inserted[0];
    } else {
      user = userRecords[0];
      if (!user.googleId) {
        // Link google account if not linked
        const updated = await db.update(users).set({ googleId, isVerified: true }).where(eq(users.id, user.id)).returning();
        user = updated[0];
      }
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(200).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
