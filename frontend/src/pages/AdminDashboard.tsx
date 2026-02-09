import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/shared/Button';
import { Card } from '../components/shared/Card';
import { Spinner } from '../components/shared/Spinner';
import { sessionsApi } from '../api/sessions';
import type { Session } from '../types';
import { Plus, Users, Clock, ArrowLeft } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await sessionsApi.getAll();
      setSessions(data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

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
        <div className="mb-4">
          <Button variant="secondary" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 inline mr-2" />
            Home
          </Button>
        </div>

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <Button onClick={() => navigate('/admin/create')}>
            <Plus className="w-4 h-4 inline mr-2" />
            Create Session
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <p className="text-center text-gray-500">No sessions yet. Create your first session!</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {sessions.map((session) => (
              <Card key={session.id} className="hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl font-mono font-bold">{session.code}</span>
                      <span className={`px-2 py-1 rounded text-sm font-medium ${getStatusColor(session.status)}`}>
                        {session.status}
                      </span>
                    </div>
                    <div className="flex gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {session.market_size} players
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {session.num_rounds} rounds &times; {session.time_per_round}s
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {session.status === 'waiting' && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await sessionsApi.start(session.id);
                          loadSessions();
                        }}
                      >
                        Start
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/session/${session.code}/monitor`)}
                    >
                      View
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
