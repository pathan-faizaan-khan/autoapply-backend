import express from 'express';
import { db } from '../db/index.js';
import { users, userProfiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth.js';

const router = express.Router();

router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    
    // Get user base info
    const [user] = await db.select({
      name: users.name,
      email: users.email
    }).from(users).where(eq(users.id, userId));

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get user profile
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));

    res.json({
      name: user.name,
      email: user.email,
      profile: profile || null
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { linkedInUrl, githubUrl, portfolioUrl, phone, address, skills, resumeText } = req.body;

    const [existing] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));

    if (existing) {
      await db.update(userProfiles)
        .set({
          linkedInUrl, githubUrl, portfolioUrl, phone, address, skills, resumeText,
          updatedAt: new Date()
        })
        .where(eq(userProfiles.userId, userId));
    } else {
      await db.insert(userProfiles).values({
        userId, linkedInUrl, githubUrl, portfolioUrl, phone, address, skills, resumeText
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
