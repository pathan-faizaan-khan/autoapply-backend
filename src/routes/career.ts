import express from 'express';
import fetch from 'node-fetch';
import { db } from '../db/index.js';
import { userProfiles, resumes, resumePersonalInfo, resumeSkills } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8001";

// Helper to get user profile data
async function getUserProfileData(userId: number) {
  let [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  const [latestResume] = await db.select().from(resumes).where(eq(resumes.userId, userId)).orderBy(desc(resumes.createdAt)).limit(1);

  let skills = profile?.skills || '';
  let resumeText = profile?.resumeText || '';
  let targetRole = profile?.jobTitle || '';

  if (latestResume) {
    if (!skills) {
      const skillsRecords = await db.select().from(resumeSkills).where(eq(resumeSkills.resumeId, latestResume.id));
      skills = skillsRecords.map(s => s.name).join(', ');
    }
    if (!resumeText) {
      const [pi] = await db.select().from(resumePersonalInfo).where(eq(resumePersonalInfo.resumeId, latestResume.id));
      resumeText = pi?.summary || '';
    }
  }
  return { skills, resumeText, targetRole };
}

// POST /api/career/chat
router.post('/chat', async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { message } = req.body;
    
    if (!message) return res.status(400).json({ error: "Message is required" });

    // Grab profile context
    const { skills, resumeText, targetRole } = await getUserProfileData(userId);

    // Prepare payload for FastAPI
    const payload = {
      user_id: userId.toString(),
      message,
      resume_data: resumeText ? { summary: resumeText, skills } : null,
      target_role: targetRole || null,
      career_path: null
    };

    const response = await fetch(`${FASTAPI_URL}/api/career/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("FastAPI Error (/chat):", errorText);
      return res.status(response.status).json({ error: "Failed to communicate with AI agent" });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error in /api/career/chat:', error);
    res.status(500).json({ error: 'Failed to chat with AI agent' });
  }
});

// GET /api/career/session
router.get('/session', async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const response = await fetch(`${FASTAPI_URL}/api/career/session/${userId}`);
    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch session" });
    }
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error in /api/career/session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// GET /api/career/roadmap/:id
router.get('/roadmap/:id', async (req, res) => {
  try {
    const response = await fetch(`${FASTAPI_URL}/api/career/roadmap/${req.params.id}`);
    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch roadmap" });
    }
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error in /api/career/roadmap/:id:', error);
    res.status(500).json({ error: 'Failed to fetch roadmap' });
  }
});

// POST /api/career/generate-roadmap
router.post('/generate-roadmap', async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { target_role, current_skills, experience_level, preferred_duration, learning_style } = req.body;

    const { skills: dbSkills, targetRole: dbTargetRole } = await getUserProfileData(userId);

    const payload = {
      user_id: userId.toString(),
      target_role: target_role || dbTargetRole || "Software Engineer",
      current_skills: current_skills || (dbSkills ? dbSkills.split(',').map(s=>s.trim()) : []),
      experience_level: experience_level || "junior",
      preferred_duration: preferred_duration || 90,
      learning_style: learning_style || "mixed"
    };

    const response = await fetch(`${FASTAPI_URL}/api/career/generate-roadmap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("FastAPI Error (/generate-roadmap):", errorText);
      return res.status(response.status).json({ error: "Failed to generate roadmap" });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error in /api/career/generate-roadmap:', error);
    res.status(500).json({ error: 'Failed to generate roadmap' });
  }
});

export default router;
