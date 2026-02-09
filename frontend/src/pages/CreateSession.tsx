import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/shared/Button';
import { Input } from '../components/shared/Input';
import { Card } from '../components/shared/Card';
import { sessionsApi } from '../api/sessions';
import type { CreateSessionData } from '../types';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

// Game type metadata (used when API isn't available yet for future game types)
const GAME_TYPES: Array<{
  value: string;
  label: string;
  description: string;
  weekNumber: number;
  category: string;
  usesValuationCost: boolean;
}> = [
  { value: 'double_auction', label: 'Double Auction', description: 'Continuous double auction market', weekNumber: 1, category: 'Continuous Trading', usesValuationCost: true },
  { value: 'double_auction_tax', label: 'Double Auction + Tax/Subsidy', description: 'DA with per-unit tax or subsidy', weekNumber: 2, category: 'Continuous Trading', usesValuationCost: true },
  { value: 'double_auction_price_controls', label: 'Double Auction + Price Controls', description: 'DA with price floor or ceiling', weekNumber: 3, category: 'Continuous Trading', usesValuationCost: true },
  { value: 'bertrand', label: 'Bertrand Competition', description: 'Firms simultaneously set prices', weekNumber: 4, category: 'Simultaneous Move', usesValuationCost: false },
  { value: 'cournot', label: 'Cournot Competition', description: 'Firms simultaneously choose quantities', weekNumber: 5, category: 'Simultaneous Move', usesValuationCost: false },
  { value: 'public_goods', label: 'Public Goods Game', description: 'Voluntary contribution to a public good', weekNumber: 6, category: 'Simultaneous Move', usesValuationCost: false },
  { value: 'negative_externality', label: 'Negative Externality', description: 'Production with social costs', weekNumber: 8, category: 'Simultaneous Move', usesValuationCost: false },
  { value: 'ultimatum', label: 'Ultimatum Game', description: 'Propose/accept split of endowment', weekNumber: 9, category: 'Sequential Move', usesValuationCost: false },
  { value: 'gift_exchange', label: 'Gift Exchange', description: 'Employer offers wage, worker chooses effort', weekNumber: 10, category: 'Sequential Move', usesValuationCost: false },
  { value: 'principal_agent', label: 'Principal-Agent', description: 'Contract design and effort choice', weekNumber: 11, category: 'Sequential Move', usesValuationCost: false },
  { value: 'comparative_advantage', label: 'Comparative Advantage', description: 'Trade between countries with different productivities', weekNumber: 12, category: 'Specialized', usesValuationCost: false },
  { value: 'monopoly', label: 'Monopoly', description: 'Single seller sets price on demand curve', weekNumber: 13, category: 'Specialized', usesValuationCost: false },
  { value: 'market_for_lemons', label: 'Market for Lemons', description: 'Adverse selection with hidden quality', weekNumber: 14, category: 'Specialized', usesValuationCost: false },
];

export const CreateSession: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [selectedGameType, setSelectedGameType] = useState('double_auction');
  const [formData, setFormData] = useState<CreateSessionData>({
    game_type: 'double_auction',
    game_config: {},
    market_size: 10,
    num_rounds: 5,
    time_per_round: 180,
    valuation_min: 20,
    valuation_max: 60,
    valuation_increments: 10,
    cost_min: 15,
    cost_max: 55,
    cost_increments: 10,
    bot_enabled: false,
  });

  const selectedGame = GAME_TYPES.find(g => g.value === selectedGameType);
  const showValuationCost = selectedGame?.usesValuationCost ?? true;

  const handleGameTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const gameType = e.target.value;
    setSelectedGameType(gameType);
    setFormData(prev => ({
      ...prev,
      game_type: gameType,
      game_config: {},
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const session = await sessionsApi.create(formData);
      toast.success(`Session created! Code: ${session.code}`);
      navigate(`/session/${session.code}/monitor`);
    } catch (error) {
      console.error('Failed to create session:', error);
      toast.error('Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value
    }));
  };

  // Group game types by category
  const categories = GAME_TYPES.reduce((acc, game) => {
    if (!acc[game.category]) acc[game.category] = [];
    acc[game.category].push(game);
    return acc;
  }, {} as Record<string, typeof GAME_TYPES>);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <Button
          variant="secondary"
          onClick={() => navigate('/admin')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 inline mr-2" />
          Back
        </Button>

        <Card title="Create New Session">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Game Type Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Game Type
              </label>
              <select
                value={selectedGameType}
                onChange={handleGameTypeChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              >
                {Object.entries(categories).map(([category, games]) => (
                  <optgroup key={category} label={category}>
                    {games.map(game => (
                      <option key={game.value} value={game.value}>
                        Week {game.weekNumber}: {game.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedGame && (
                <p className="text-xs text-gray-500 mt-1">{selectedGame.description}</p>
              )}
            </div>

            {/* Common Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Market Size"
                name="market_size"
                type="number"
                value={formData.market_size}
                onChange={handleChange}
                min={2}
                max={100}
                required
              />

              <Input
                label="Number of Rounds"
                name="num_rounds"
                type="number"
                value={formData.num_rounds}
                onChange={handleChange}
                min={1}
                max={50}
                required
              />

              <Input
                label="Time per Round (seconds)"
                name="time_per_round"
                type="number"
                value={formData.time_per_round}
                onChange={handleChange}
                min={30}
                max={600}
                required
              />
            </div>

            {/* DA-specific: Valuation/Cost settings */}
            {showValuationCost && (
              <>
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Buyer Valuations</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      label="Minimum"
                      name="valuation_min"
                      type="number"
                      value={formData.valuation_min}
                      onChange={handleChange}
                      required
                    />
                    <Input
                      label="Maximum"
                      name="valuation_max"
                      type="number"
                      value={formData.valuation_max}
                      onChange={handleChange}
                      required
                    />
                    <Input
                      label="Increments"
                      name="valuation_increments"
                      type="number"
                      value={formData.valuation_increments}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Seller Costs</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      label="Minimum"
                      name="cost_min"
                      type="number"
                      value={formData.cost_min}
                      onChange={handleChange}
                      required
                    />
                    <Input
                      label="Maximum"
                      name="cost_max"
                      type="number"
                      value={formData.cost_max}
                      onChange={handleChange}
                      required
                    />
                    <Input
                      label="Increments"
                      name="cost_increments"
                      type="number"
                      value={formData.cost_increments}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {/* Non-DA game notice */}
            {!showValuationCost && (
              <div className="border-t pt-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <p className="text-sm text-amber-800">
                    Game-specific configuration for <strong>{selectedGame?.label}</strong> will be available once this game type is fully implemented.
                    For now, the session will be created with default settings.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="bot_enabled"
                name="bot_enabled"
                checked={formData.bot_enabled}
                onChange={handleChange}
                className="w-4 h-4 rounded border-gray-300"
              />
              <label htmlFor="bot_enabled" className="text-sm">
                Enable bot replacement for disconnected players
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate('/admin')}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Session'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};
