import React, { useState, useEffect } from 'react';
import { Card } from './Card';
import { Input } from './Input';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { sessionsApi } from '../../api/sessions';
import { Lock } from 'lucide-react';

interface AdminPasswordGateProps {
  sessionCode: string;
  children: React.ReactNode;
}

export const AdminPasswordGate: React.FC<AdminPasswordGateProps> = ({ sessionCode, children }) => {
  const [checking, setChecking] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [verified, setVerified] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const storageKey = `admin_pw_${sessionCode}`;

  useEffect(() => {
    checkAccess();
  }, [sessionCode]);

  const checkAccess = async () => {
    setChecking(true);
    try {
      const session = await sessionsApi.getByCode(sessionCode);

      if (!session.has_admin_password) {
        // No admin password set — pass through
        setNeedsPassword(false);
        setVerified(true);
        setChecking(false);
        return;
      }

      setNeedsPassword(true);

      // Check localStorage for a saved password
      const savedPassword = localStorage.getItem(storageKey);
      if (savedPassword) {
        const ok = await sessionsApi.verifyAdminPassword(sessionCode, savedPassword);
        if (ok) {
          setVerified(true);
          setChecking(false);
          return;
        } else {
          // Saved password is wrong (maybe changed), clear it
          localStorage.removeItem(storageKey);
        }
      }

      setVerified(false);
    } catch (err) {
      console.error('Failed to check admin access:', err);
      // If we can't load the session, let the child page handle the error
      setVerified(true);
    }
    setChecking(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const ok = await sessionsApi.verifyAdminPassword(sessionCode, password);
    if (ok) {
      localStorage.setItem(storageKey, password);
      setVerified(true);
    } else {
      setError('Incorrect admin password');
    }

    setSubmitting(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (needsPassword && !verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-sky-100">
        <div className="max-w-md w-full mx-4">
          <Card title="Admin Access Required">
            <div className="flex items-center gap-2 mb-4 text-amber-700">
              <Lock className="w-5 h-5" />
              <span className="text-sm font-medium">
                This session is protected with an admin password.
              </span>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Admin Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                required
                autoFocus
              />
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={submitting || !password}>
                {submitting ? 'Verifying...' : 'Access Session'}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // Verified or no password needed — render the child page
  return <>{children}</>;
};
