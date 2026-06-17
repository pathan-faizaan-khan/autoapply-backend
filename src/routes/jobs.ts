import express from 'express';
import { db } from '../db/index.js'; // Assuming there is a db index
import { scrapedJobs, userProfiles, resumes, resumePersonalInfo, resumeSkills } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import fetch from 'node-fetch';

const router = express.Router();

const FASTAPI_URL = process.env.FASTAPI_URL || "https://autoapply-scraper-backend.onrender.com";

// Helper to calculate match score
function calculateMatchScore(jobDescription: string, profileSkills: string, profileText: string): number {
  if (!jobDescription) return 0;
  const target = jobDescription.toLowerCase();
  
  let score = 40; // base score for location/title loosely matching
  
  if (profileSkills) {
    const skills = profileSkills.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (skills.length > 0) {
      let matchedSkills = 0;
      skills.forEach(s => {
        if (target.includes(s)) matchedSkills++;
      });
      const skillBonus = Math.min((matchedSkills / Math.max(skills.length, 5)) * 50, 50);
      score += skillBonus;
    }
  }

  if (profileText) {
    const keywords = profileText.split(/\s+/).map(s => s.toLowerCase()).filter(s => s.length > 4);
    let matchedKeywords = 0;
    keywords.forEach(k => {
      if (target.includes(k)) matchedKeywords++;
    });
    score += Math.min(matchedKeywords * 2, 10);
  }
  
  return Math.floor(Math.min(score, 98));
}

// Helper to get user profile data
async function getUserProfileData(userId: number) {
  let [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  const [latestResume] = await db.select().from(resumes).where(eq(resumes.userId, userId)).orderBy(desc(resumes.createdAt)).limit(1);

  let skills = profile?.skills || '';
  let resumeText = profile?.resumeText || '';

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
  return { skills, resumeText };
}

// GET /api/jobs - fetch all scraped jobs with match score
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const jobs = await db.select().from(scrapedJobs).orderBy(desc(scrapedJobs.createdAt));
    const { skills, resumeText } = await getUserProfileData(userId);

    const jobsWithScore = jobs.map(job => {
      const combinedDesc = `${job.title} ${job.description || ''}`;
      return {
        ...job,
        matchScore: calculateMatchScore(combinedDesc, skills, resumeText)
      };
    });

    res.json(jobsWithScore);
  } catch (error) {
    console.error('Error fetching scraped jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// POST /api/jobs/google-search - fetch from fastapi, insert to db, and return with match score
router.post('/google-search', async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const body = req.body;
    
    // 1. Fetch from FastAPI
    const response = await fetch(`${FASTAPI_URL}/api/jobs/google-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch from scraper" });
    }
    
    const data: any = await response.json();
    const jobs = data.jobs || [];
    
    // 2. Insert into scraped_jobs pool ignoring duplicates (jobUrl is unique)
    for (const job of jobs) {
      if (!job.job_url) continue;
      try {
        await db.insert(scrapedJobs).values({
          title: job.title || 'Unknown Title',
          companyName: job.company_name || 'Unknown Company',
          jobUrl: job.job_url,
          location: job.location || 'Remote',
          description: job.description || '',
          appliedPeoples: 0,
        }).onConflictDoNothing({ target: scrapedJobs.jobUrl });
      } catch (err) {
        console.error('Error inserting job:', err);
      }
    }

    // 3. Calculate match score
    const { skills, resumeText } = await getUserProfileData(userId);
    const jobsWithScore = jobs.map((job: any) => {
      const combinedDesc = `${job.title} ${job.description || ''}`;
      return {
        ...job,
        match_score: calculateMatchScore(combinedDesc, skills, resumeText)
      };
    });

    res.json({ jobs: jobsWithScore });
  } catch (error) {
    console.error('Error in google-search:', error);
    res.status(500).json({ error: 'Failed to search jobs' });
  }
});

export default router;
