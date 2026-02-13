import React, { useState, useEffect } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, FileText, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

interface PairResult {
  firstMoverId: string;
  firstMoverName: string;
  secondMoverId: string;
  secondMoverName: string;
  firstMoveAction: { fixedWage: number; bonus: number };
  secondMoveAction: { highEffort: boolean };
  firstMoverProfit: number;
  secondMoverProfit: number;
  firstMoverResultData: { isHighOutput: boolean; output: number; bonusPaid: number };
  secondMoverResultData: { isHighOutput: boolean; output: number; effortCost: number; bonusPaid: number };
}

/**
 * Principal-Agent Game UI (Week 11)
 */
const PrincipalAgentUI: React.FC<GameUIProps> = ({
  session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  const [fixedWage, setFixedWage] = useState('');
  const [bonus, setBonus] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [partnerContract, setPartnerContract] = useState<{ fixedWage: number; bonus: number } | null>(null);
  const [results, setResults] = useState<PairResult[] | null>(null);

  const gameConfig = session?.game_config || {};
  const highOutput = gameConfig.highOutput ?? 100;
  const lowOutput = gameConfig.lowOutput ?? 30;
  const highEffortProb = gameConfig.highEffortProb ?? 0.8;
  const lowEffortProb = gameConfig.lowEffortProb ?? 0.2;
  const effortCostAmount = gameConfig.effortCost ?? 10;
  const maxWage = gameConfig.maxWage ?? 50;
  const maxBonus = gameConfig.maxBonus ?? 50;
  const isPrincipal = player?.role === 'principal';

  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setFixedWage('');
      setBonus('');
      setPartnerContract(null);
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
      if (!isPrincipal && state.partnerAction) {
        setPartnerContract({ fixedWage: state.partnerAction.fixedWage, bonus: state.partnerAction.bonus });
      }
      if (state.results) {
        setResults(state.results.map ? state.results : []);
      }
    }));

    cleanups.push(onEvent('first-move-submitted', (data: { partnerId: string; action: { fixedWage: number; bonus: number } }) => {
      if (data.partnerId === playerId) {
        setPartnerContract(data.action);
        toast(`Contract received: $${data.action.fixedWage} wage + $${data.action.bonus} bonus`, { icon: '📄' });
      }
    }));

    cleanups.push(onEvent('second-move-submitted', (data: { partnerId: string }) => {
      if (data.partnerId === playerId) {
        toast('Agent chose effort level!', { icon: '⚡' });
      }
    }));

    cleanups.push(onEvent('round-results', (data: { pairs: PairResult[] }) => {
      setResults(data.pairs);
      refreshPlayer();
      const myPair = data.pairs.find(p => p.firstMoverId === playerId || p.secondMoverId === playerId);
      if (myPair) {
        const myProfit = myPair.firstMoverId === playerId ? myPair.firstMoverProfit : myPair.secondMoverProfit;
        const outputStr = myPair.firstMoverResultData.isHighOutput ? 'HIGH' : 'LOW';
        toast.success(`Output: ${outputStr} ($${myPair.firstMoverResultData.output}) | Profit: $${myProfit.toFixed(2)}`);
      }
    }));

    return () => cleanups.forEach(fn => fn());
  }, [onEvent, playerId, refreshPlayer, isPrincipal]);

  const handlePrincipalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId || !fixedWage || !bonus || submitted) return;
    const fw = parseFloat(fixedWage);
    const b = parseFloat(bonus);
    submitAction({ type: 'first_move', fixedWage: fw, bonus: b });
    setSubmitted(true);
    toast.success('Contract sent!');
  };

  const handleAgentDecision = (highEffort: boolean) => {
    if (!roundId || submitted) return;
    submitAction({ type: 'second_move', highEffort });
    setSubmitted(true);
    toast.success(highEffort ? 'Chose high effort!' : 'Chose low effort');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Game & Action */}
      <div className="space-y-4">
        <Card>
          <div className="text-center mb-2">
            <div className="px-3 py-1 inline-block rounded-full text-sm font-medium bg-purple-100 text-purple-700">
              You are the {isPrincipal ? 'Principal' : 'Agent'}
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">High Output:</span>
              <span className="font-medium">${highOutput}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Low Output:</span>
              <span className="font-medium">${lowOutput}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">High Effort &rarr; High Out:</span>
              <span className="font-medium">{(highEffortProb * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Low Effort &rarr; High Out:</span>
              <span className="font-medium">{(lowEffortProb * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">High Effort Cost:</span>
              <span className="font-medium">${effortCostAmount}</span>
            </div>
          </div>
        </Card>

        <Card title={isPrincipal ? 'Design Contract' : 'Choose Effort'}>
          {roundActive && roundId ? (
            isPrincipal ? (
              submitted ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium mb-2">Contract Sent!</div>
                  <p className="text-sm text-gray-500">Waiting for agent to choose effort...</p>
                </div>
              ) : (
                <form onSubmit={handlePrincipalSubmit} className="space-y-3">
                  <Input
                    label={`Fixed Wage ($0 - $${maxWage})`}
                    type="number"
                    step="1"
                    min="0"
                    max={maxWage}
                    value={fixedWage}
                    onChange={(e) => setFixedWage(e.target.value)}
                    placeholder="Fixed wage..."
                    required
                  />
                  <Input
                    label={`Bonus for High Output ($0 - $${maxBonus})`}
                    type="number"
                    step="1"
                    min="0"
                    max={maxBonus}
                    value={bonus}
                    onChange={(e) => setBonus(e.target.value)}
                    placeholder="Bonus if high output..."
                    required
                  />
                  <Button type="submit" className="w-full" disabled={!fixedWage || !bonus}>
                    <FileText className="w-4 h-4 inline mr-2" />
                    Send Contract
                  </Button>
                </form>
              )
            ) : (
              submitted ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium">Effort Choice Submitted!</div>
                  <p className="text-sm text-gray-500 mt-1">Waiting for output to be revealed...</p>
                </div>
              ) : partnerContract ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-amber-700 mb-2">Your Contract:</p>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>Fixed Wage:</span>
                        <span className="font-bold">${partnerContract.fixedWage}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Bonus (if high output):</span>
                        <span className="font-bold">${partnerContract.bonus}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleAgentDecision(true)}
                      className="p-4 rounded-lg border-2 border-green-200 bg-green-50 hover:bg-green-100 transition text-center"
                    >
                      <Zap className="w-6 h-6 mx-auto text-green-600 mb-1" />
                      <div className="font-medium text-green-700">High Effort</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Cost: ${effortCostAmount}<br />
                        {(highEffortProb * 100).toFixed(0)}% chance high output
                      </div>
                    </button>
                    <button
                      onClick={() => handleAgentDecision(false)}
                      className="p-4 rounded-lg border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 transition text-center"
                    >
                      <Zap className="w-6 h-6 mx-auto text-gray-400 mb-1" />
                      <div className="font-medium text-gray-700">Low Effort</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Cost: $0<br />
                        {(lowEffortProb * 100).toFixed(0)}% chance high output
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Users className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">Waiting for principal to design contract...</p>
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
                const isHigh = pair.firstMoverResultData.isHighOutput;
                return (
                  <div key={i} className={`rounded-lg p-4 ${isMyPair ? 'bg-sky-50 border border-sky-200' : 'bg-gray-50'}`}>
                    <div className={`text-center mb-2 px-2 py-1 rounded text-sm font-medium ${isHigh ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      Output: {isHigh ? 'HIGH' : 'LOW'} (${pair.firstMoverResultData.output})
                    </div>
                    <div className="text-sm space-y-2">
                      <div className="flex justify-between">
                        <span>{pair.firstMoverName || 'Principal'}</span>
                        <span className={`font-bold ${pair.firstMoverProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${pair.firstMoverProfit.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>{pair.secondMoverName || 'Agent'}</span>
                        <span className={`font-bold ${pair.secondMoverProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${pair.secondMoverProfit.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Wage: ${pair.firstMoveAction.fixedWage} | Bonus: ${pair.firstMoverResultData.bonusPaid} |
                        Effort: {pair.secondMoveAction.highEffort ? 'High' : 'Low'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Results will appear after all pairs complete</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default PrincipalAgentUI;
