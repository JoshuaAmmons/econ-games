import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/shared/Button';
import { Input } from '../components/shared/Input';
import { Card } from '../components/shared/Card';
import { playersApi } from '../api/players';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export const JoinSession: React.FC = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { player, session } = await playersApi.join(code.toUpperCase(), name || undefined);

      // Store player info
      localStorage.setItem('playerId', player.id);
      localStorage.setItem('sessionCode', session.code);

      toast.success('Joined session successfully!');

      // Navigate to lobby
      navigate(`/session/${session.code}/lobby`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to join session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-sky-100">
      <div className="max-w-md w-full mx-4">
        <Button
          variant="secondary"
          onClick={() => navigate('/')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 inline mr-2" />
          Back
        </Button>

        <Card title="Join Session">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Session Code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-character code"
              maxLength={6}
              required
              autoFocus
            />

            <Input
              label="Your Name (Optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
            />

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
              {loading ? 'Joining...' : 'Join Session'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};
