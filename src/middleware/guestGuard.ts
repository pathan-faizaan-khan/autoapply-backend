/**
 * guestGuard.ts
 *
 * Express middleware that blocks guest users (isGuest === true) from
 * performing any mutating or resource-intensive actions.
 *
 * Apply AFTER authenticateToken on any route that should be restricted.
 * Read-only routes (GET) can remain ungated for guests.
 *
 * Usage:
 *   app.use('/api/resumes', authenticateToken, guestGuard, resumeRoutes);
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';

export const guestGuard = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.user?.isGuest) {
    res.status(403).json({
      error: 'Guest access restricted',
      message: 'This action is not available for guest sessions. Please sign up for a free account to unlock full access.',
      isGuestBlock: true,
    });
    return;
  }
  next();
};

/**
 * Selective guard — only blocks mutating HTTP methods (POST/PUT/PATCH/DELETE).
 * Allows guests to read (GET/HEAD) while blocking writes.
 * Useful for routes like /api/jobs where guests can browse but not apply.
 */
export const guestMutationGuard = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (req.user?.isGuest && mutatingMethods.includes(req.method)) {
    res.status(403).json({
      error: 'Guest access restricted',
      message: 'This action is not available for guest sessions. Please sign up for a free account to unlock full access.',
      isGuestBlock: true,
    });
    return;
  }
  next();
};
