import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/shared/Card';
import { Spinner } from '../components/shared/Spinner';
import { playersApi } from '../api/players';
import { sessionsApi } from '../api/sessions';
import type { Player, Session } from '../types';
import { User } from 'lucide-react';

const DA_GAME_TYPES = ['double_auction', 'double_auction_tax', 'double_auction_price_controls'];

const GAME_TYPE_LABELS: Record<string, string> = {
  double_auction: 'Double Auction',
  double_auction_tax: 'DA + Tax/Subsidy',
  double_auction_price_controls: 'DA + Price Controls',
  bertrand: 'Bertrand Competition',
  cournot: 'Cournot Competition',
  public_goods: 'Public Goods Game',
  negative_externality: 'Negative Externality',
  ultimatum: 'Ultimatum Game',
  gift_exchange: 'Gift Exchange',
  principal_agent: 'Principal-Agent',
  comparative_advantage: 'Comparative Advantage',
  monopoly: 'Monopoly',
  market_for_lemons: 'Market for Lemons',
};

/** Short descriptions of what each role does in each game */
const ROLE_INFO: Record<string, Record<string, string[]>> = {
  double_auction: {
    buyer: [
      'You are a <strong>buyer</strong> with a private valuation',
      'Submit bids (your maximum price to pay)',
      'Profit = Valuation - Trade Price',
    ],
    seller: [
      'You are a <strong>seller</strong> with a private cost',
      'Submit asks (your minimum price to accept)',
      'Profit = Trade Price - Cost',
    ],
  },
  double_auction_tax: {
    buyer: [
      'You are a <strong>buyer</strong> with a private valuation',
      'A per-unit tax or subsidy may apply to trades',
      'Profit = Valuation - Trade Price (adjusted for tax/subsidy)',
    ],
    seller: [
      'You are a <strong>seller</strong> with a private cost',
      'A per-unit tax or subsidy may apply to trades',
      'Profit = Trade Price - Cost (adjusted for tax/subsidy)',
    ],
  },
  double_auction_price_controls: {
    buyer: [
      'You are a <strong>buyer</strong> with a private valuation',
      'A price floor or ceiling may be active',
      'Profit = Valuation - Trade Price',
    ],
    seller: [
      'You are a <strong>seller</strong> with a private cost',
      'A price floor or ceiling may be active',
      'Profit = Trade Price - Cost',
    ],
  },
  bertrand: {
    firm: [
      'You are a <strong>firm</strong> in a price competition',
      'Set your price each round — lowest price wins the market',
      'Profit = (Price - Marginal Cost) x Demand',
    ],
  },
  cournot: {
    firm: [
      'You are a <strong>firm</strong> in a quantity competition',
      'Choose how much to produce each round',
      'Market price falls as total output increases',
    ],
  },
  public_goods: {
    player: [
      'You have an <strong>endowment</strong> each round',
      'Choose how much to contribute to the public good',
      'The group pot is multiplied and shared equally',
    ],
  },
  negative_externality: {
    firm: [
      'You are a <strong>firm</strong> that produces a good',
      'Choose your production level each round',
      'Production creates environmental damage shared by all',
    ],
  },
  ultimatum: {
    proposer: [
      'You are the <strong>proposer</strong>',
      'Propose how to split an endowment with your partner',
      'If rejected, both earn nothing',
    ],
    responder: [
      'You are the <strong>responder</strong>',
      'You will see an offer from the proposer',
      'Accept to split or reject (both earn zero)',
    ],
  },
  gift_exchange: {
    employer: [
      'You are the <strong>employer</strong>',
      'Offer a wage to your worker',
      'Your profit depends on the worker\'s effort',
    ],
    worker: [
      'You are the <strong>worker</strong>',
      'You will see the wage offered by your employer',
      'Choose your effort level — higher effort is costly',
    ],
  },
  principal_agent: {
    principal: [
      'You are the <strong>principal</strong>',
      'Design a contract: fixed wage + bonus for high output',
      'Your profit = Output - Wage - Bonus paid',
    ],
    agent: [
      'You are the <strong>agent</strong>',
      'You will see the contract offered',
      'Choose high or low effort (high effort is costly but raises output probability)',
    ],
  },
  comparative_advantage: {
    country: [
      'You are a <strong>country</strong> with limited labor',
      'Allocate workers between two goods',
      'Your utility depends on how much of each good you produce',
    ],
  },
  monopoly: {
    monopolist: [
      'You are a <strong>monopolist</strong> — the only seller',
      'Set your price on a downward-sloping demand curve',
      'Find the price that maximizes your profit',
    ],
  },
  market_for_lemons: {
    seller: [
      'You are a <strong>seller</strong> with a used car',
      'You know the quality — set your asking price',
      'If the buyer passes, you keep the car',
    ],
    buyer: [
      'You are a <strong>buyer</strong> looking for a car',
      'You see the price but <strong>not</strong> the quality',
      'Decide whether to buy or pass',
    ],
  },
};

export const Lobby: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [player, setPlayer] = useState<Player | null>(null);
  const [session, setSession] = useState<Session | null>(null);
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
      const { player, session: s } = await playersApi.getStatus(playerId);
      setPlayer(player);

      // Load full session for game_type
      if (!session) {
        const fullSession = await sessionsApi.getByCode(code || '');
        setSession(fullSession);
      }

      // If session started, redirect to market
      if (s.status === 'active') {
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

  const gameType = session?.game_type || 'double_auction';
  const isDA = DA_GAME_TYPES.includes(gameType);
  const role = player?.role || 'player';
  const gameInfo = ROLE_INFO[gameType]?.[role] || [
    `You are a <strong>${role}</strong>`,
    'Wait for the instructor to start the session',
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-2xl w-full mx-4">
        <Card>
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-1">Session {code}</h1>
            <span className="inline-block px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-sm font-medium mb-4">
              {GAME_TYPE_LABELS[gameType] || gameType}
            </span>
            <p className="text-gray-600 mb-6">Waiting for instructor to start...</p>

            <div className="bg-sky-50 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-center gap-2 text-sky-700 mb-2">
                <User className="w-5 h-5" />
                <span className="font-semibold">Your Role</span>
              </div>
              <p className="text-2xl font-bold text-sky-900 capitalize">{role}</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="font-semibold mb-3">Game Information</h3>
              <div className="text-left space-y-2 text-sm">
                {gameInfo.map((line, i) => (
                  <p key={i} dangerouslySetInnerHTML={{ __html: line }} />
                ))}

                {/* Show DA-specific values */}
                {isDA && player?.role === 'buyer' && player.valuation != null && (
                  <p className="mt-2 text-base font-medium text-green-700">
                    Your valuation: ${player.valuation}
                  </p>
                )}
                {isDA && player?.role === 'seller' && player.production_cost != null && (
                  <p className="mt-2 text-base font-medium text-red-700">
                    Your cost: ${player.production_cost}
                  </p>
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
