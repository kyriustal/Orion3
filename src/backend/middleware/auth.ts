import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'orion-fallback-secret-key';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    orgId: string;
    email: string;
    role: string;
    name?: string;
    subscription?: { status: string; plan: string; };
  };
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    if (req.user && !req.user.orgId) {
      req.user.orgId = req.user.id;
    }
    if (req.user && !req.user.role) {
      req.user.role = 'OWNER';
    }
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
};
