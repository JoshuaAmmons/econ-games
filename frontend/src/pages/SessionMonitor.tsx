import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Spinner } from '../components/shared/Spinner';
import { sessionsApi } from '../api/sessions';
import type { Session } from '../types';
import { ArrowLeft, Play, Square, Users } from 'lucide-react';

export const SessionMonitor: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSession();
    const interval = setInterval(loadSession, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadSession = async () => {
    try {
      if (!code) return;
      const data = await sessionsApi.getByCode(code);
      setSession(data);
    } catch (error) {
      console.error('Failed to load session:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!session) return;
    try {
      await sessionsApi.start(session.id);
      loadSession();
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const handleEnd = async () => {
    if (!session) return;
    try {
      await sessionsApi.end(session.id);
      loadSession();
    } catch (error) {
      console.error('Failed to end session:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <p className="text-gray-500">Session not found</p>
          <Button onClick={() => navigate('/admin')} className="mt-4">
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return 'bg-yellow-100 text-yellow-800';
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <Button variant="secondary" onClick={() => navigate('/admin')} className="mb-4">
          <ArrowLeft className="w-4 h-4 inline mr-2" />
          Back to Dashboard
        </Button>

        {/* Session Header */}
        <Card className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-mono font-bold">{session.code}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(session.status)}`}>
                  {session.status}
                </span>
              </div>
              <div className="flex gap-6 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  Market size: {session.market_size}
                </span>
                <span>Round {session.current_round} / {session.num_rounds}</span>
                <span>{session.time_per_round}s per round</span>
              </div>
            </div>
            <div className="flex gap-2">
              {session.status === 'waiting' && (
                <Button onClick={handleStart}>
                  <Play className="w-4 h-4 inline mr-2" />
                  Start Session
                </Button>
              )}
              {session.status === 'active' && (
                <Button variant="danger" onClick={handleEnd}>
                  <Square className="w-4 h-4 inline mr-2" />
                  End Session
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Session Config */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card title="Buyer Valuations">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-gray-500">Min</p>
                <p className="text-xl font-bold">${session.valuation_min}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Max</p>
                <p className="text-xl font-bold">${session.valuation_max}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Increment</p>
                <p className="text-xl font-bold">${session.valuation_increments}</p>
              </div>
            </div>
          </Card>

          <Card title="Seller Costs">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-gray-500">Min</p>
                <p className="text-xl font-bold">${session.cost_min}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Max</p>
                <p className="text-xl font-bold">${session.cost_max}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Increment</p>
                <p className="text-xl font-bold">${session.cost_increments}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Share Code */}
        {session.status === 'waiting' && (
          <Card className="text-center">
            <p className="text-gray-600 mb-2">Share this code with students to join:</p>
            <p className="text-5xl font-mono font-bold text-sky-600 tracking-widest">{session.code}</p>
            <p className="text-sm text-gray-400 mt-2">
              Students can join at the home page by clicking "Join Session as Student"
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};
