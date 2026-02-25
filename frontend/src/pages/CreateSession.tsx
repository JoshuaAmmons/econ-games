import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/shared/Button';
import { Input } from '../components/shared/Input';
import { Card } from '../components/shared/Card';
import { sessionsApi } from '../api/sessions';
import type { CreateSessionData, GameTypeConfig } from '../types';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

// Fallback game type list (used if API isn't available)
const FALLBACK_GAME_TYPES: Array<{
  value: string;
  label: string;
  description: string;
  weekNumber: number;
  category: string;
  usesValuationCost: boolean;
  configFields: Array<{
    name: string;
    label: string;
    type: 'number' | 'select' | 'checkbox';
    default: any;
    min?: number;
    max?: number;
    step?: number;
    options?: Array<{ value: string; label: string }>;
    description?: string;
  }>;
}> = [
  // Continuous Trading games
  { value: 'double_auction', label: 'Double Auction', description: 'Continuous double auction market', weekNumber: 4, category: 'Continuous Trading', usesValuationCost: true, configFields: [] },
  { value: 'double_auction_tax', label: 'Double Auction + Tax/Subsidy', description: 'DA with per-unit tax or subsidy', weekNumber: 8, category: 'Continuous Trading', usesValuationCost: true, configFields: [] },
  { value: 'double_auction_price_controls', label: 'Double Auction + Price Controls', description: 'DA with price floor or ceiling', weekNumber: 6, category: 'Continuous Trading', usesValuationCost: true, configFields: [] },
  // Simultaneous Move games
  { value: 'prisoner_dilemma', label: "Prisoner's Dilemma", description: 'Players simultaneously choose to cooperate or defect', weekNumber: 1, category: 'Simultaneous Move', usesValuationCost: false, configFields: [
    { name: 'market_size', label: 'Number of Players', type: 'number' as const, default: 8, min: 2, max: 40 },
    { name: 'num_rounds', label: 'Number of Rounds', type: 'number' as const, default: 10, min: 1, max: 50 },
    { name: 'time_per_round', label: 'Time per Round (seconds)', type: 'number' as const, default: 60, min: 15, max: 300 },
    { name: 'reward', label: 'Reward (both cooperate)', type: 'number' as const, default: 3, min: 0, max: 100, step: 0.5 },
    { name: 'temptation', label: 'Temptation (defect vs cooperate)', type: 'number' as const, default: 5, min: 0, max: 100, step: 0.5 },
    { name: 'sucker', label: 'Sucker (cooperate vs defect)', type: 'number' as const, default: 0, min: 0, max: 100, step: 0.5 },
    { name: 'punishment', label: 'Punishment (both defect)', type: 'number' as const, default: 1, min: 0, max: 100, step: 0.5 },
  ]},
  { value: 'beauty_contest', label: 'Beauty Contest (Guess 2/3 of Average)', description: 'Choose a number. The winner is closest to a fraction of the group average.', weekNumber: 2, category: 'Simultaneous Move', usesValuationCost: false, configFields: [
    { name: 'market_size', label: 'Number of Players', type: 'number' as const, default: 8, min: 2, max: 40 },
    { name: 'num_rounds', label: 'Number of Rounds', type: 'number' as const, default: 10, min: 1, max: 50 },
    { name: 'time_per_round', label: 'Time per Round (seconds)', type: 'number' as const, default: 60, min: 15, max: 300 },
    { name: 'maxNumber', label: 'Maximum Number', type: 'number' as const, default: 100, min: 10, max: 1000, step: 1 },
    { name: 'fraction', label: 'Target Fraction', type: 'number' as const, default: 0.667, min: 0.01, max: 1, step: 0.01 },
    { name: 'prize', label: 'Prize', type: 'number' as const, default: 10, min: 1, max: 100, step: 1 },
  ]},
  { value: 'bertrand', label: 'Bertrand Competition', description: 'Firms simultaneously set prices', weekNumber: 17, category: 'Simultaneous Move', usesValuationCost: false, configFields: [] },
  { value: 'cournot', label: 'Cournot Competition', description: 'Firms simultaneously choose quantities', weekNumber: 18, category: 'Simultaneous Move', usesValuationCost: false, configFields: [] },
  { value: 'public_goods', label: 'Public Goods Game', description: 'Voluntary contribution to a public good', weekNumber: 11, category: 'Simultaneous Move', usesValuationCost: false, configFields: [] },
  { value: 'negative_externality', label: 'Negative Externality', description: 'Production with social costs', weekNumber: 10, category: 'Simultaneous Move', usesValuationCost: false, configFields: [] },
  { value: 'common_pool_resource', label: 'Common Pool Resource', description: 'Players choose how much to extract from a shared resource', weekNumber: 12, category: 'Simultaneous Move', usesValuationCost: false, configFields: [
    { name: 'market_size', label: 'Number of Players', type: 'number' as const, default: 8, min: 2, max: 40 },
    { name: 'num_rounds', label: 'Number of Rounds', type: 'number' as const, default: 10, min: 1, max: 50 },
    { name: 'time_per_round', label: 'Time per Round (seconds)', type: 'number' as const, default: 60, min: 15, max: 300 },
    { name: 'poolSize', label: 'Pool Size (units)', type: 'number' as const, default: 100, min: 1, max: 10000, step: 1 },
    { name: 'maxExtraction', label: 'Max Extraction per Player', type: 'number' as const, default: 25, min: 1, max: 1000, step: 1 },
    { name: 'extractionValue', label: 'Value per Unit ($)', type: 'number' as const, default: 1, min: 0.01, max: 100, step: 0.01 },
    { name: 'regenerationRate', label: 'Regeneration Rate', type: 'number' as const, default: 0.5, min: 0, max: 5, step: 0.05 },
  ]},
  { value: 'stag_hunt', label: 'Stag Hunt', description: 'Players choose to hunt stag (risky, high reward) or hare (safe, moderate reward)', weekNumber: 15, category: 'Simultaneous Move', usesValuationCost: false, configFields: [
    { name: 'market_size', label: 'Group Size', type: 'number' as const, default: 6, min: 2, max: 40 },
    { name: 'num_rounds', label: 'Number of Rounds', type: 'number' as const, default: 10, min: 1, max: 50 },
    { name: 'time_per_round', label: 'Time per Round (seconds)', type: 'number' as const, default: 60, min: 15, max: 300 },
    { name: 'stagPayoff', label: 'Stag Payoff', type: 'number' as const, default: 5, min: 1, max: 100, step: 1 },
    { name: 'harePayoff', label: 'Hare Payoff', type: 'number' as const, default: 3, min: 1, max: 100, step: 1 },
  ]},
  { value: 'dictator', label: 'Dictator Game', description: 'Each player decides how much of their endowment to give away', weekNumber: 21, category: 'Simultaneous Move', usesValuationCost: false, configFields: [
    { name: 'market_size', label: 'Group Size', type: 'number' as const, default: 8, min: 2, max: 40 },
    { name: 'num_rounds', label: 'Number of Rounds', type: 'number' as const, default: 5, min: 1, max: 20 },
    { name: 'time_per_round', label: 'Time per Round (seconds)', type: 'number' as const, default: 60, min: 15, max: 300 },
    { name: 'endowment', label: 'Endowment (tokens)', type: 'number' as const, default: 10, min: 1, max: 100, step: 1 },
  ]},
  { value: 'matching_pennies', label: 'Matching Pennies', description: 'Matchers try to match; mismatchers try to differ. A zero-sum game.', weekNumber: 24, category: 'Simultaneous Move', usesValuationCost: false, configFields: [
    { name: 'market_size', label: 'Group Size', type: 'number' as const, default: 8, min: 2, max: 40, step: 2 },
    { name: 'num_rounds', label: 'Number of Rounds', type: 'number' as const, default: 10, min: 1, max: 50 },
    { name: 'time_per_round', label: 'Time per Round (seconds)', type: 'number' as const, default: 60, min: 15, max: 300 },
    { name: 'winPayoff', label: 'Win Payoff', type: 'number' as const, default: 1, min: 0.5, max: 10, step: 0.5 },
  ]},
  { value: 'auction', label: 'Sealed-Bid Auction', description: 'Bidders with private valuations submit sealed bids', weekNumber: 22, category: 'Simultaneous Move', usesValuationCost: false, configFields: [
    { name: 'market_size', label: 'Number of Bidders', type: 'number' as const, default: 4, min: 2, max: 20 },
    { name: 'num_rounds', label: 'Number of Rounds', type: 'number' as const, default: 10, min: 1, max: 30 },
    { name: 'time_per_round', label: 'Time per Round (seconds)', type: 'number' as const, default: 60, min: 15, max: 300 },
    { name: 'auctionType', label: 'Auction Type', type: 'select' as const, default: 'first_price', options: [{ value: 'first_price', label: 'First-Price (pay your bid)' }, { value: 'second_price', label: 'Second-Price (pay second-highest bid)' }] },
    { name: 'valueMin', label: 'Minimum Valuation ($)', type: 'number' as const, default: 10, min: 0, max: 500, step: 1 },
    { name: 'valueMax', label: 'Maximum Valuation ($)', type: 'number' as const, default: 100, min: 1, max: 1000, step: 1 },
  ]},
  // Sequential Move games
  { value: 'ultimatum', label: 'Ultimatum Game', description: 'Propose/accept split of endowment', weekNumber: 7, category: 'Sequential Move', usesValuationCost: false, configFields: [] },
  { value: 'gift_exchange', label: 'Gift Exchange', description: 'Employer offers wage, worker chooses effort', weekNumber: 19, category: 'Sequential Move', usesValuationCost: false, configFields: [] },
  { value: 'principal_agent', label: 'Principal-Agent', description: 'Contract design and effort choice', weekNumber: 14, category: 'Sequential Move', usesValuationCost: false, configFields: [] },
  { value: 'trust_game', label: 'Trust Game', description: 'Sender sends money (multiplied), receiver decides how much to return', weekNumber: 20, category: 'Sequential Move', usesValuationCost: false, configFields: [
    { name: 'market_size', label: 'Number of Players', type: 'number' as const, default: 6, min: 2, max: 40, step: 2 },
    { name: 'num_rounds', label: 'Number of Rounds', type: 'number' as const, default: 5, min: 1, max: 20 },
    { name: 'time_per_round', label: 'Time per Round (seconds)', type: 'number' as const, default: 120, min: 30, max: 300 },
    { name: 'endowment', label: 'Endowment ($)', type: 'number' as const, default: 10, min: 1, max: 100, step: 1 },
    { name: 'multiplier', label: 'Multiplier', type: 'number' as const, default: 3, min: 1, max: 5, step: 0.5 },
  ]},
  { value: 'bargaining', label: 'Bargaining Game', description: 'Proposer states how much to keep. Responder accepts or rejects.', weekNumber: 5, category: 'Sequential Move', usesValuationCost: false, configFields: [
    { name: 'market_size', label: 'Number of Players', type: 'number' as const, default: 6, min: 2, max: 40, step: 2 },
    { name: 'num_rounds', label: 'Number of Rounds', type: 'number' as const, default: 5, min: 1, max: 20 },
    { name: 'time_per_round', label: 'Time per Round (seconds)', type: 'number' as const, default: 120, min: 30, max: 300 },
    { name: 'pieSize', label: 'Pie Size ($)', type: 'number' as const, default: 10, min: 1, max: 100, step: 1 },
    { name: 'discountFactor', label: 'Discount Factor', type: 'number' as const, default: 0.9, min: 0.1, max: 1, step: 0.05 },
  ]},
  { value: 'market_for_lemons', label: 'Market for Lemons', description: 'Adverse selection with hidden quality', weekNumber: 23, category: 'Sequential Move', usesValuationCost: false, configFields: [] },
  // Specialized games
  { value: 'comparative_advantage', label: 'Comparative Advantage', description: 'Trade between countries with different productivities', weekNumber: 9, category: 'Specialized', usesValuationCost: false, configFields: [] },
  { value: 'monopoly', label: 'Monopoly', description: 'Single seller sets price on demand curve', weekNumber: 16, category: 'Specialized', usesValuationCost: false, configFields: [] },
  { value: 'discovery_process', label: 'Exchange & Specialization', description: 'Produce goods, trade, and discover benefits of specialization', weekNumber: 3, category: 'Specialized', usesValuationCost: false, configFields: [] },
];

export const CreateSession: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [selectedGameType, setSelectedGameType] = useState('double_auction');
  const [gameTypes, setGameTypes] = useState<Array<{
    value: string;
    label: string;
    description: string;
    weekNumber: number;
    category: string;
    usesValuationCost: boolean;
    configFields: Array<any>;
  }>>(FALLBACK_GAME_TYPES);
  const [gameConfig, setGameConfig] = useState<Record<string, any>>({});
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

  // Fetch game types from backend (includes config fields with defaults)
  useEffect(() => {
    sessionsApi.getGameTypes().then((data: GameTypeConfig[]) => {
      const mapped = data.map(g => ({
        value: g.gameType,
        label: g.config.name,
        description: g.config.description,
        weekNumber: g.config.weekNumber,
        category: g.config.category === 'continuous_trading' ? 'Continuous Trading' :
                  g.config.category === 'simultaneous' ? 'Simultaneous Move' :
                  g.config.category === 'sequential' ? 'Sequential Move' : 'Specialized',
        usesValuationCost: g.config.usesValuationCost,
        configFields: g.config.configFields.filter(f => !f.daOnly),
      }));
      setGameTypes(mapped);
    }).catch(err => {
      console.error('Failed to fetch game types, using fallback:', err);
    });
  }, []);

  const selectedGame = gameTypes.find(g => g.value === selectedGameType);
  const showValuationCost = selectedGame?.usesValuationCost ?? true;

  const handleGameTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const gt = e.target.value;
    setSelectedGameType(gt);

    // Populate default config from the engine's config fields
    const game = gameTypes.find(g => g.value === gt);
    const defaults: Record<string, any> = {};
    if (game) {
      for (const field of game.configFields) {
        defaults[field.name] = field.default;
      }
    }
    setGameConfig(defaults);
    // Sync top-level session fields from game config defaults
    const topLevelOverrides: Record<string, any> = {};
    for (const key of ['market_size', 'num_rounds', 'time_per_round']) {
      if (defaults[key] !== undefined) {
        topLevelOverrides[key] = Number(defaults[key]);
      }
    }
    setFormData(prev => ({
      ...prev,
      game_type: gt,
      game_config: defaults,
      ...topLevelOverrides,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const session = await sessionsApi.create({
        ...formData,
        game_config: gameConfig,
      });
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

  const handleConfigChange = (name: string, value: any) => {
    setGameConfig(prev => {
      const next = { ...prev, [name]: value };
      // Sync game config fields that share names with top-level session fields
      const topLevelFields = ['market_size', 'num_rounds', 'time_per_round'];
      const updates: Record<string, any> = { game_config: next };
      if (topLevelFields.includes(name)) {
        updates[name] = Number(value);
      }
      setFormData(f => ({ ...f, ...updates }));
      return next;
    });
  };

  // Group game types by category
  const categories = gameTypes.reduce((acc, game) => {
    if (!acc[game.category]) acc[game.category] = [];
    acc[game.category].push(game);
    return acc;
  }, {} as Record<string, typeof gameTypes>);

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
                        {game.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedGame && (
                <p className="text-xs text-gray-500 mt-1">{selectedGame.description}</p>
              )}
            </div>

            {/* Common Settings — hide fields that the game config section will render */}
            {(() => {
              // Only hide common fields when the game config section is shown (!showValuationCost)
              // and those fields are defined in the game's configFields
              const configFieldNames = !showValuationCost
                ? new Set(selectedGame?.configFields.map((f: any) => f.name) || [])
                : new Set<string>();
              const commonFields = [
                { label: 'Market Size', name: 'market_size', min: 2, max: 100 },
                { label: 'Number of Rounds', name: 'num_rounds', min: 1, max: 50 },
                { label: 'Time per Round (seconds)', name: 'time_per_round', min: 30, max: 600 },
              ].filter(f => !configFieldNames.has(f.name));
              return commonFields.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {commonFields.map(f => (
                    <Input
                      key={f.name}
                      label={f.label}
                      name={f.name}
                      type="number"
                      value={(formData as any)[f.name]}
                      onChange={handleChange}
                      min={f.min}
                      max={f.max}
                      required
                    />
                  ))}
                </div>
              ) : null;
            })()}

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

            {/* DA variant config fields (tax/subsidy, price controls) */}
            {showValuationCost && selectedGame && (() => {
              const variantFields = selectedGame.configFields.filter(
                (f: any) => !['market_size', 'num_rounds', 'time_per_round'].includes(f.name)
              );
              if (variantFields.length === 0) return null;
              return (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Variant Settings</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {variantFields.map((field: any) => {
                      if (field.type === 'select' && field.options) {
                        return (
                          <div key={field.name}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {field.label}
                            </label>
                            <select
                              value={gameConfig[field.name] ?? field.default}
                              onChange={(e) => handleConfigChange(field.name, e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                            >
                              {field.options.map((opt: any) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            {field.description && (
                              <p className="text-xs text-gray-400 mt-0.5">{field.description}</p>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div key={field.name}>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {field.label}
                          </label>
                          <input
                            type="number"
                            value={gameConfig[field.name] ?? field.default}
                            onChange={(e) => handleConfigChange(field.name, Number(e.target.value))}
                            min={field.min}
                            max={field.max}
                            step={field.step || 1}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                          />
                          {field.description && (
                            <p className="text-xs text-gray-400 mt-0.5">{field.description}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Non-DA Game Config Fields (from engine's getUIConfig) */}
            {!showValuationCost && selectedGame && selectedGame.configFields.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Game Settings</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedGame.configFields.map((field) => {
                    if (field.type === 'checkbox') {
                      return (
                        <div key={field.name} className="flex items-center gap-2 col-span-full">
                          <input
                            type="checkbox"
                            id={`config_${field.name}`}
                            checked={gameConfig[field.name] ?? field.default}
                            onChange={(e) => handleConfigChange(field.name, e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                          <label htmlFor={`config_${field.name}`} className="text-sm">
                            {field.label}
                          </label>
                          {field.description && (
                            <span className="text-xs text-gray-400">({field.description})</span>
                          )}
                        </div>
                      );
                    }

                    if (field.type === 'select' && field.options) {
                      return (
                        <div key={field.name}>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {field.label}
                          </label>
                          <select
                            value={gameConfig[field.name] ?? field.default}
                            onChange={(e) => handleConfigChange(field.name, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                          >
                            {field.options.map((opt: any) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          {field.description && (
                            <p className="text-xs text-gray-400 mt-0.5">{field.description}</p>
                          )}
                        </div>
                      );
                    }

                    // Default: number input
                    return (
                      <div key={field.name}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {field.label}
                        </label>
                        <input
                          type="number"
                          value={gameConfig[field.name] ?? field.default}
                          onChange={(e) => handleConfigChange(field.name, Number(e.target.value))}
                          min={field.min}
                          max={field.max}
                          step={field.step || 1}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                        />
                        {field.description && (
                          <p className="text-xs text-gray-400 mt-0.5">{field.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No config fields and not DA — show defaults message */}
            {!showValuationCost && selectedGame && selectedGame.configFields.length === 0 && (
              <div className="border-t pt-4">
                <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-3">
                  <p className="text-sm text-sky-800">
                    <strong>{selectedGame.label}</strong> uses default game settings. Customize the number of rounds, time, and market size above.
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

            <Input
              label="Session Passcode (Optional)"
              name="passcode"
              value={formData.passcode || ''}
              onChange={handleChange}
              placeholder="Leave blank for open access"
              maxLength={20}
            />

            <div>
              <Input
                label="Admin Password (Optional)"
                name="admin_password"
                value={formData.admin_password || ''}
                onChange={handleChange}
                placeholder="Protect monitor/analytics access"
                maxLength={50}
              />
              <p className="text-xs text-gray-400 mt-1">
                If set, only users with this password can view session monitor, analytics, and results.
              </p>
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
