import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/shared/Button';
import { Input } from '../components/shared/Input';
import { Card } from '../components/shared/Card';
import { sessionsApi } from '../api/sessions';
import type { CreateSessionData } from '../types';
import { ArrowLeft } from 'lucide-react';

export const CreateSession: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateSessionData>({
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const session = await sessionsApi.create(formData);
      alert(`Session created! Code: ${session.code}`);
      navigate('/admin');
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('Failed to create session');
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
