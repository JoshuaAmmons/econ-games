import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { SessionModel } from '../models/Session';

/**
 * Middleware that verifies the caller has admin access to a session.
 *
 * Looks up the session from :id (or :code) route param, then checks the
 * `x-admin-password` header against the stored (bcrypt-hashed) password.
 * If the session has no admin password set, the request is allowed through.
 *
 * Usage:
 *   router.post('/:id/start', requireAdmin, SessionController.start);
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string | undefined;

    if (!sessionId) {
      // For routes without :id (e.g. DELETE /), skip per-session auth
      // but require the global x-admin-password header to match a known session
      // For safety, just reject — deleteAll needs its own guard
      res.status(401).json({ success: false, error: 'Admin authentication required' });
      return;
    }

    const session = await SessionModel.findById(sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    // If no admin password is set on this session, allow open access
    if (!session.admin_password) {
      next();
      return;
    }

    // Only accept password from header or body — never from query string
    // (query strings are logged in server access logs and browser history)
    const providedPassword =
      (req.headers['x-admin-password'] as string) ||
      req.body?.admin_password;

    if (!providedPassword) {
      res.status(401).json({ success: false, error: 'Admin password required' });
      return;
    }

    // Compare: support both bcrypt hashed and legacy plaintext passwords
    let isValid = false;
    if (session.admin_password.startsWith('$2a$') || session.admin_password.startsWith('$2b$')) {
      isValid = await bcrypt.compare(providedPassword, session.admin_password);
    } else {
      // Legacy plaintext comparison (for sessions created before hashing was added)
      isValid = providedPassword === session.admin_password;
    }

    if (!isValid) {
      res.status(401).json({ success: false, error: 'Incorrect admin password' });
      return;
    }

    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    res.status(500).json({ success: false, error: 'Authentication check failed' });
  }
}

/**
 * Middleware for the deleteAll endpoint — requires a confirmation header.
 * This prevents accidental mass deletion.
 */
export async function requireDeleteAllConfirmation(req: Request, res: Response, next: NextFunction) {
  const confirmation = req.headers['x-confirm-delete-all'] as string;
  if (confirmation !== 'true') {
    res.status(400).json({
      success: false,
      error: 'Confirmation required: set x-confirm-delete-all header to "true"',
    });
    return;
  }
  next();
}
