import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Briefcase, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

interface PairResult {
  firstMoverId: string;
  firstMoverName: string;
  secondMoverId: string;
  secondMoverName: string;
  firstMoveAction: { wage: number };
  secondMoveAction: { effort: number };
  firstMoverProfit: number;
  secondMoverProfit: number;
  firstMoverResultData: { output: number; costOfEffort: number };
  secondMoverResultData: { output: number; costOfEffort: number };
}

/**
 * Gift Exchange Game UI (Week 10)
 */
const GiftExchangeUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [wage, setWage] = useState('');
  const [effort, setEffort] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [partnerWage, setPartnerWage] = useState<number | null>(null);
  const [results, setResults] = useState<PairResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const maxWage = gameConfig.maxWage ?? 50;
  const maxEffort = gameConfig.maxEffort ?? 10;
  const productivityMultiplier = gameConfig.productivityMultiplier ?? 10;
  const maxEffortCost = gameConfig.maxEffortCost ?? 20;
  const isEmployer = player?.role === 'employer';

  const effortCost = (e: number) => {
    const ratio = e / maxEffort;
    return ratio * ratio * maxEffortCost;
  };

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setWage('');
      setEffort('');
      setPartnerWage(null);
      setResults(null);
    }
  }, [roundId, roundActive]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    // Recover game state on page load / reconnect
    cleanups.push(onEvent('game-state', (state: any) => {
      if (state.myAction) {
        setSubmitted(true);
      }
      if (!isEmployer && state.partnerAction) {
        setPartnerWage(state.partnerAction.wage);
      }
      if (state.results) {
        setResults(state.results.map ? state.results : []);
      }
    }));

    cleanups.push(onEvent('first-move-submitted', (data: { partnerId: string; action: { wage: number } }) => {
      if (data.partnerId === playerId) {
        setPartnerWage(data.action.wage);
        toast(`Your employer offered $${Number(data.action.wage).toFixed(2)} wage`, { icon: '💼' });
      }
    }));

    cleanups.push(onEvent('second-move-submitted', (data: { partnerId: string }) => {
      if (data.partnerId === playerId) {
        toast('Worker chose effort level!', { icon: '⚡' });
      }
    }));

    cleanups.push(onEvent('round-results', (data: { pairs: PairResult[] }) => {
      setResults(data.pairs);
      refreshPlayer();
      const myPair = data.pairs.find(p => p.firstMoverId === playerId || p.secondMoverId === playerId);
      if (myPair) {
        const myProfit = myPair.firstMoverId === playerId ? myPair.firstMoverProfit : myPair.secondMoverProfit;
        toast.success(`Profit: $${Number(myProfit).toFixed(2)}`);
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer, isEmployer]);

  const handleEmployerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !wage || submitted) return;
    const wageNum = parseFloat(wage);
    if (isNaN(wageNum) || wageNum < 0 || wageNum > maxWage) {
      toast.error(`Wage must be between $0 and $${maxWage}`);
      return;
    }
    submitAction({ type: 'first_move', wage: wageNum });
    setSubmitted(true);
    toast.success(`Offered wage of $${wageNum.toFixed(2)}`);
  };

  const handleWorkerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !effort || submitted) return;
    const effortNum = parseInt(effort);
    if (isNaN(effortNum) || effortNum < 1 || effortNum > maxEffort) {
      toast.error(`Effort must be between 1 and ${maxEffort}`);
      return;
    }
    submitAction({ type: 'second_move', effort: effortNum });
    setSubmitted(true);
    toast.success(`Chose effort level ${effortNum}`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Game & Action */}
      <div className="space-y-4">
        <Card>
          <div className="text-center">
            <div className="mt-1 px-3 py-1 inline-block rounded-full text-sm font-medium bg-purple-100 text-purple-700">
              You are the {isEmployer ? 'Employer' : 'Worker'}
            </div>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Max Wage:</span>
              <span className="font-medium">${maxWage}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Effort:</span>
              <span className="font-medium">{maxEffort}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Output per Effort:</span>
              <span className="font-medium">${productivityMultiplier}/unit</span>
            </div>
            <div className="text-xs text-gray-400 mt-2 p-2 bg-gray-50 rounded">
              Employer profit = effort &times; ${productivityMultiplier} - wage<br />
              Worker profit = wage - effort cost (quadratic)
            </div>
          </div>
        </Card>

        <Card title={isEmployer ? 'Set Wage' : 'Choose Effort'}>
          {roundActive && roundId ? (
            isEmployer ? (
              submitted ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium mb-2">Wage Sent!</div>
                  <p className="text-sm text-gray-500">Waiting for worker to choose effort...</p>
                </div>
              ) : (
                <form onSubmit={handleEmployerSubmit} className="space-y-3">
                  <Input
                    label="Wage Offer ($)"
                    type="number"
                    step="1"
                    min="0"
                    max={maxWage}
                    value={wage}
                    onChange={(e) => setWage(e.target.value)}
                    placeholder={`$0 - $${maxWage}`}
                    required
                  />
                  <Button type="submit" className="w-full" disabled={!wage}>
                    <Briefcase className="w-4 h-4 inline mr-2" />
                    Offer Wage
                  </Button>
                </form>
              )
            ) : (
              submitted ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium">Effort Submitted!</div>
                </div>
              ) : partnerWage !== null ? (
                <form onSubmit={handleWorkerSubmit} className="space-y-3">
                  <div className="bg-amber-50 rounded p-3 text-center">
                    <p className="text-sm text-gray-500">Your employer offered:</p>
                    <p className="text-2xl font-bold text-amber-700">${Number(partnerWage).toFixed(2)}</p>
                  </div>
                  <Input
                    label={`Effort Level (1 - ${maxEffort})`}
                    type="number"
                    step="1"
                    min="1"
                    max={maxEffort}
                    value={effort}
                    onChange={(e) => setEffort(e.target.value)}
                    placeholder={`1 - ${maxEffort}`}
                    required
                  />
                  {effort && (
                    <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                      <div>Effort cost: ${effortCost(parseInt(effort) || 0).toFixed(2)}</div>
                      <div>Your profit: ${(partnerWage - effortCost(parseInt(effort) || 0)).toFixed(2)}</div>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={!effort}>
                    <Zap className="w-4 h-4 inline mr-2" />
                    Submit Effort
                  </Button>
                </form>
              ) : (
                <div className="text-center py-4">
                  <Users className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">Waiting for employer to set wage...</p>
                </div>
              )
            )
          ) : (
            <p className="text-center text-gray-500 py-4">Waiting for round to start...</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              <span className="font-medium">Total Profit</span>
            </div>
            <span className={`text-2xl font-bold ${(Number(player?.total_profit) || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${Number(player?.total_profit || 0).toFixed(2)}
            </span>
          </div>
        </Card>
      </div>

      {/* Right: Results */}
      <div>
        <Card title="Round Results">
          {results ? (
            <div className="space-y-3">
              {results.map((pair, i) => {
                const isMyPair = pair.firstMoverId === playerId || pair.secondMoverId === playerId;
                return (
                  <div key={i} className={`rounded-lg p-4 ${isMyPair ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'}`}>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium">{pair.firstMoverName || 'Employer'}</span>
                        <span className={`font-bold ${Number(pair.firstMoverProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${Number(pair.firstMoverProfit).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Wage: ${Number(pair.firstMoveAction?.wage ?? 0).toFixed(2)} | Output: ${pair.firstMoverResultData?.output ?? "N/A"}
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="font-medium">{pair.secondMoverName || 'Worker'}</span>
                        <span className={`font-bold ${Number(pair.secondMoverProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${Number(pair.secondMoverProfit).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Effort: {pair.secondMoveAction?.effort ?? "N/A"} | Cost: ${Number(pair.secondMoverResultData?.costOfEffort ?? 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all pairs complete</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default GiftExchangeUI;
