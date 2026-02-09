import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/shared/Card';
import { Spinner } from '../components/shared/Spinner';
import { playersApi } from '../api/players';
import type { Player } from '../types';
import { User } from 'lucide-react';

export const Lobby: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const playerId = localStorage.getItem('playerId');
    if (!playerId) {
      navigate('/join');
      return;
    }

    loadPlayer(playerId);

    // Poll for session status changes
    const interval = setInterval(() => {
      loadPlayer(playerId);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const loadPlayer = async (playerId: string) => {
    try {
      const { player, session } = await playersApi.getStatus(playerId);
      setPlayer(player);

      // If session started, redirect to market
      if (session.status === 'active') {
        navigate(`/session/${code}/market`);
      }
    } catch (error) {
      console.error('Failed to load player:', error);
      navigate('/join');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-2xl w-full mx-4">
        <Card>
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-2">Session {code}</h1>
            <p className="text-gray-600 mb-6">Waiting for instructor to start...</p>

            <div className="bg-sky-50 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-center gap-2 text-sky-700 mb-2">
                <User className="w-5 h-5" />
                <span className="font-semibold">Your Role</span>
              </div>
              <p className="text-2xl font-bold text-sky-900 capitalize">{player?.role}</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="font-semibold mb-3">Game Information</h3>
              <div className="text-left space-y-2 text-sm">
                {player?.role === 'buyer' ? (
                  <>
                    <p>You are a <strong>buyer</strong> with a private valuation</p>
                    <p>Your valuation: <strong>${player.valuation}</strong></p>
                    <p>Submit bids (your maximum price to pay)</p>
                    <p>Profit = Valuation - Trade Price</p>
                  </>
                ) : (
                  <>
                    <p>You are a <strong>seller</strong> with a private cost</p>
                    <p>Your cost: <strong>${player?.production_cost}</strong></p>
                    <p>Submit asks (your minimum price to accept)</p>
                    <p>Profit = Trade Price - Cost</p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-6">
              <div className="animate-pulse flex items-center justify-center gap-2 text-gray-500">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <span className="ml-2">Waiting for session to start</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
