import express from 'express';
import { db } from '../db/index.js'; // Assuming there is a db index
import { scrapedJobs } from '../db/schema.js';
import { desc } from 'drizzle-orm';

const router = express.Router();

// GET /api/jobs - fetch all scraped jobs
router.get('/', async (req, res) => {
  try {
    const jobs = await db.select().from(scrapedJobs).orderBy(desc(scrapedJobs.createdAt));
    res.json(jobs);
  } catch (error) {
    console.error('Error fetching scraped jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

export default router;
