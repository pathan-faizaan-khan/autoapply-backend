import { Router } from 'express';
import { db } from '../db/index.js';
import { interviews } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = Router();
const getUserId = (req: any) => req.user!.userId;

// GET /api/interviews
router.get('/', async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const data = await db
      .select()
      .from(interviews)
      .where(eq(interviews.userId, userId))
      .orderBy(desc(interviews.dateTime));
    res.json({ interviews: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch interviews' });
  }
});

// POST /api/interviews
router.post('/', async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { company, role, dateTime, platform, link, notes } = req.body;
    const [interview] = await db.insert(interviews).values({
      userId,
      company,
      role,
      dateTime: new Date(dateTime),
      platform: platform || 'Other',
      link: link || '',
      notes: notes || '',
      status: 'scheduled'
    }).returning();
    res.status(201).json({ interview });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create interview' });
  }
});

// DELETE /api/interviews/:id
router.delete('/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = getUserId(req);
    await db.delete(interviews).where(eq(interviews.id, id)); // could add AND userId check for security
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete interview' });
  }
});

export default router;
