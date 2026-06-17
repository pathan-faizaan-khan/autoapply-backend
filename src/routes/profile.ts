import express from 'express';
import { db } from '../db/index.js';
import { users, userProfiles, resumes, resumePersonalInfo, resumeSkills } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
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
    let [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));

    // Fallback to latest resume data if fields are missing
    const [latestResume] = await db.select()
      .from(resumes)
      .where(eq(resumes.userId, userId))
      .orderBy(desc(resumes.createdAt))
      .limit(1);

    if (latestResume) {
      const [personalInfo] = await db.select()
        .from(resumePersonalInfo)
        .where(eq(resumePersonalInfo.resumeId, latestResume.id));
      
      const skillsRecords = await db.select()
        .from(resumeSkills)
        .where(eq(resumeSkills.resumeId, latestResume.id));
      
      const skillsStr = skillsRecords.map(s => s.name).join(', ');

      if (!profile) {
        profile = {
          id: 0,
          userId,
          phone: personalInfo?.phone || null,
          linkedInUrl: personalInfo?.linkedinUrl || null,
          githubUrl: personalInfo?.githubUrl || null,
          portfolioUrl: personalInfo?.portfolioUrl || null,
          address: null,
          skills: skillsStr || null,
          resumeText: personalInfo?.summary || null,
          createdAt: new Date(),
          updatedAt: new Date()
        } as any;
      } else {
        if (!profile.phone && personalInfo?.phone) profile.phone = personalInfo.phone;
        if (!profile.linkedInUrl && personalInfo?.linkedinUrl) profile.linkedInUrl = personalInfo.linkedinUrl;
        if (!profile.githubUrl && personalInfo?.githubUrl) profile.githubUrl = personalInfo.githubUrl;
        if (!profile.portfolioUrl && personalInfo?.portfolioUrl) profile.portfolioUrl = personalInfo.portfolioUrl;
        if (!profile.skills && skillsStr) profile.skills = skillsStr;
        if (!profile.resumeText && personalInfo?.summary) profile.resumeText = personalInfo.summary;
      }
    }

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
