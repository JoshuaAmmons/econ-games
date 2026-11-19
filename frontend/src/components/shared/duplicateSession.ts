import toast from 'react-hot-toast';
import { sessionsApi } from '../../api/sessions';
import type { Session } from '../../types';

/** A practice session (one student with bots) is not offered for duplication. */
export const isPracticeSession = (session: Pick<Session, 'game_config'>): boolean =>
  !!session.game_config?.practice;

/**
 * Create a new session with the same settings as `session` (no players or results) and return it,
 * or null if it could not be made. The copy keeps the original's admin password (the server copies
 * its stored hash), so the password this browser holds for the original is saved for the copy too;
 * if none is held, the instructor is asked for it.
 */
export async function duplicateSession(
  session: Pick<Session, 'id' | 'code' | 'has_admin_password'>
): Promise<Session | null> {
  let password = localStorage.getItem(`admin_pw_${session.code}`) || undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const copy = await sessionsApi.duplicate(session.id, password);
      if (password && copy.has_admin_password) {
        localStorage.setItem(`admin_pw_${session.code}`, password);
        localStorage.setItem(`admin_pw_${copy.code}`, password);
      }
      toast.success(`Session ${session.code} duplicated. New code: ${copy.code}`);
      return copy;
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401 && attempt === 0) {
        const entered = window.prompt(`Admin password for session ${session.code}:`);
        if (!entered) return null;
        password = entered;
        continue;
      }
      console.error('Failed to duplicate session:', error);
      toast.error(
        status === 401
          ? 'Incorrect admin password'
          : error?.response?.data?.error || 'Failed to duplicate session'
      );
      return null;
    }
  }
  return null;
}
