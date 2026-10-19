import type { Request, Response, NextFunction } from 'express';
import { authenticateWithToken } from './auth.js';
import * as db from './db.js';

export interface AuthedRequest extends Request {
  userId?: string;
  userRole?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = authenticateWithToken(token || '');
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.userId = user.id;
  req.userRole = user.role;
  next();
}

export function optionalAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = authenticateWithToken(token || '');
  if (user) {
    req.userId = user.id;
    req.userRole = user.role;
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.userId || !db.isAdmin(req.userId)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  });
}