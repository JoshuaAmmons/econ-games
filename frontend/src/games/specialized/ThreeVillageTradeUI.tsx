import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import { Input } from '../../components/shared/Input';
import type { GameUIProps } from '../GameUIRegistry';
import { DollarSign, Users, Package, ArrowRightLeft, BarChart3, Anchor } from 'lucide-react';
import toast from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Phase = 'production' | 'trade' | 'results' | 'waiting';
type GoodType = 'red' | 'blue' | 'pink';
type TradeScope = 'local' | 'global';

interface Inventory {
  red: number;
  blue: number;
  pink: number;
}

interface TradeOffer {
  offerId: string;
  playerId: string;
  playerName: string;
  village: number;
  offerGood: GoodType;
  offerAmount: number;
  wantGood: GoodType;
  wantAmount: number;
  scope: TradeScope;
}

interface CompletedTrade {
  tradeId: string;
  offererName: string;
  accepterName: string;
  offerGood: GoodType;
  offerAmount: number;
  wantGood: GoodType;
  wantAmount: number;
  timestamp?: number;
}

interface VillageAggregate {
  village: number;
  totalEarnings: number;
  averageEarnings: number;
  playerCount: number;
}

interface PlayerResult {
  playerId: string;
  playerName: string;
  village: number;
  inventory: Inventory;
  earnings: number;
  autarkyEarnings: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const VILLAGE_CONFIG: Record<
  number,
  { name: string; borderColor: string; bgColor: string; goods: [GoodType, GoodType] }
> = {
  1: { name: 'Port Crimson', borderColor: 'border-red-500/60', bgColor: 'bg-red-900/20', goods: ['red', 'blue'] },
  2: { name: 'Port Azure', borderColor: 'border-blue-500/60', bgColor: 'bg-blue-900/20', goods: ['blue', 'pink'] },
  3: { name: 'Port Rose', borderColor: 'border-pink-500/60', bgColor: 'bg-pink-900/20', goods: ['pink', 'red'] },
};

const GOOD_STYLES: Record<GoodType, { badge: string; text: string; icon: string }> = {
  red: { badge: 'bg-red-900/40 text-red-300 border-red-700/40', text: 'text-red-400', icon: '\uD83D\uDD34' },
  blue: { badge: 'bg-blue-900/40 text-blue-300 border-blue-700/40', text: 'text-blue-400', icon: '\uD83D\uDD35' },
  pink: { badge: 'bg-pink-900/40 text-pink-300 border-pink-700/40', text: 'text-pink-400', icon: '\uD83E\uDDE1' },
};

const ALL_GOODS: GoodType[] = ['red', 'blue', 'pink'];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const ThreeVillageTradeUI: React.FC<GameUIProps> = ({
  session: _session,
  player,
  playerId,
  roundId,
  roundActive,
  onEvent,
  submitAction,
  refreshPlayer,
}) => {
  // Core state
  const [phase, setPhase] = useState<Phase>('waiting');
  const [village, setVillage] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inventory, setInventory] = useState<Inventory>({ red: 0, blue: 0, pink: 0 });
  const [waitingCount, setWaitingCount] = useState({ submitted: 0, total: 0 });

  // Production state
  const [allocation, setAllocation] = useState(50); // 0-100% toward first good
  const [productionPreview, setProductionPreview] = useState<{ good1: number; good2: number }>({
    good1: 0,
    good2: 0,
  });

  // Trade state
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [tradeHistory, setTradeHistory] = useState<CompletedTrade[]>([]);
  const [offerGood, setOfferGood] = useState<GoodType>('red');
  const [offerAmount, setOfferAmount] = useState('');
  const [wantGood, setWantGood] = useState<GoodType>('blue');
  const [wantAmount, setWantAmount] = useState('');
  const [offerScope, setOfferScope] = useState<TradeScope>('local');

  // Results state
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [villageAggregates, setVillageAggregates] = useState<VillageAggregate[]>([]);
  const [myResult, setMyResult] = useState<PlayerResult | null>(null);

  // Village config
  const villageInfo = VILLAGE_CONFIG[village] || VILLAGE_CONFIG[1];

  /* ---- Production preview calculation ---- */
  const updateProductionPreview = useCallback(
    (alloc: number) => {
      // Linear production: 100 units capacity split by allocation
      const good1Amount = (alloc / 100) * 10;
      const good2Amount = ((100 - alloc) / 100) * 10;
      setProductionPreview({ good1: Math.round(good1Amount * 10) / 10, good2: Math.round(good2Amount * 10) / 10 });
    },
    []
  );

  useEffect(() => {
    updateProductionPreview(allocation);
  }, [allocation, updateProductionPreview]);

  /* ---- Reset on new round ---- */
  useEffect(() => {
    if (roundActive && roundId) {
      setSubmitted(false);
      setPhase('waiting');
      setAllocation(50);
      setInventory({ red: 0, blue: 0, pink: 0 });
      setOffers([]);
      setTradeHistory([]);
      setPlayerResults([]);
      setVillageAggregates([]);
      setMyResult(null);
      setOfferAmount('');
      setWantAmount('');
      setWaitingCount({ submitted: 0, total: 0 });
      refreshPlayer();
    }
  }, [roundId, roundActive, refreshPlayer]);

  /* ---- Socket events ---- */
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      onEvent('game-state', (state: any) => {
        if (state.phase) setPhase(state.phase);
        if (state.village) setVillage(state.village);
        if (state.inventory) setInventory(state.inventory);
        if (state.myAction) setSubmitted(true);
        if (state.offers) setOffers(state.offers);
        if (state.tradeHistory) setTradeHistory(state.tradeHistory);
        if (state.results) {
          if (state.results.players) setPlayerResults(state.results.players);
          if (state.results.villages) setVillageAggregates(state.results.villages);
          const me = state.results.players?.find((p: PlayerResult) => p.playerId === playerId);
          if (me) setMyResult(me);
        }
        if (state.totalSubmitted !== undefined && state.totalPlayers !== undefined) {
          setWaitingCount({ submitted: state.totalSubmitted, total: state.totalPlayers });
        }
      })
    );

    cleanups.push(
      onEvent('phase-changed', (data: any) => {
        if (data.phase) {
          setPhase(data.phase);
          setSubmitted(false);
          setWaitingCount({ submitted: 0, total: 0 });
        }
        if (data.inventory) setInventory(data.inventory);
        if (data.offers) setOffers(data.offers);
      })
    );

    cleanups.push(
      onEvent('phase-change', (data: any) => {
        if (data.phase) {
          setPhase(data.phase);
          setSubmitted(false);
          setWaitingCount({ submitted: 0, total: 0 });
        }
        if (data.inventory) setInventory(data.inventory);
      })
    );

    cleanups.push(
      onEvent('production-submitted', (data: any) => {
        if (data.inventory) setInventory(data.inventory);
      })
    );

    cleanups.push(
      onEvent('production-results', (data: any) => {
        if (data.inventory) setInventory(data.inventory);
      })
    );

    cleanups.push(
      onEvent('trade-offer-posted', (data: any) => {
        if (data.offer) {
          setOffers((prev) => {
            const exists = prev.some((o) => o.offerId === data.offer.offerId);
            return exists ? prev : [...prev, data.offer];
          });
        }
        if (data.offers) setOffers(data.offers);
      })
    );

    cleanups.push(
      onEvent('trade-offer-accepted', (data: any) => {
        // Remove accepted offer and update inventory
        if (data.offerId) {
          setOffers((prev) => prev.filter((o) => o.offerId !== data.offerId));
        }
        if (data.offers) setOffers(data.offers);
        if (data.inventory) setInventory(data.inventory);
        if (data.trade) {
          setTradeHistory((prev) => [...prev, data.trade]);
          const isAccepter = data.trade.accepterName === player?.name;
          const isOfferer = data.trade.offererName === player?.name;
          if (isAccepter || isOfferer) {
            toast.success('Trade completed!');
          }
        }
      })
    );

    cleanups.push(
      onEvent('trade-offer-cancelled', (data: any) => {
        if (data.offerId) {
          setOffers((prev) => prev.filter((o) => o.offerId !== data.offerId));
        }
        if (data.offers) setOffers(data.offers);
      })
    );

    cleanups.push(
      onEvent('action-submitted', (data: { submitted: number; total: number }) => {
        setWaitingCount({ submitted: data.submitted, total: data.total });
      })
    );

    cleanups.push(
      onEvent('round-results', (data: any) => {
        const res = data.results || data;
        if (res.players) setPlayerResults(res.players);
        if (res.villages) setVillageAggregates(res.villages);
        const me = (res.players || []).find((p: PlayerResult) => p.playerId === playerId);
        if (me) {
          setMyResult(me);
          if (me.inventory) setInventory(me.inventory);
        }
        setPhase('results');
        refreshPlayer();
        if (me) {
          toast.success(`Round complete! Earnings: $${Number(me.earnings).toFixed(2)}`);
        }
      })
    );

    cleanups.push(
      onEvent('error', () => {
        setSubmitted(false);
        setSubmitting(false);
      })
    );

    return () => cleanups.forEach((fn) => fn());
  }, [onEvent, playerId, refreshPlayer, player?.name]);

  /* ---- Actions ---- */
  const handleProduction = () => {
    if (!roundId || submitted) return;
    setSubmitting(true);
    submitAction({ type: 'produce', allocation });
    setSubmitted(true);
    toast.success('Production plan submitted!');
    setTimeout(() => setSubmitting(false), 500);
  };

  const handlePostOffer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundId) return;

    const oAmt = parseFloat(offerAmount);
    const wAmt = parseFloat(wantAmount);
    if (isNaN(oAmt) || oAmt <= 0 || isNaN(wAmt) || wAmt <= 0) {
      toast.error('Please enter valid amounts');
      return;
    }
    if (offerGood === wantGood) {
      toast.error('Cannot trade a good for itself');
      return;
    }
    if (oAmt > inventory[offerGood]) {
      toast.error(`You only have ${inventory[offerGood].toFixed(1)} ${offerGood} goods`);
      return;
    }

    setSubmitting(true);
    submitAction({
      type: 'post_offer',
      offerGood,
      offerAmount: oAmt,
      wantGood,
      wantAmount: wAmt,
      scope: offerScope,
    });
    setOfferAmount('');
    setWantAmount('');
    toast.success('Cargo offered on the exchange!');
    setTimeout(() => setSubmitting(false), 500);
  };

  const handleAcceptOffer = (offerId: string) => {
    if (!roundId) return;
    submitAction({ type: 'accept_offer', offerId });
    toast.success('Trade accepted!');
  };

  const handleCancelOffer = (offerId: string) => {
    if (!roundId) return;
    submitAction({ type: 'cancel_offer', offerId });
    toast('Offer withdrawn', { icon: '\u274C' });
  };

  /* ---- Goods badge renderer ---- */
  const GoodBadge: React.FC<{ good: GoodType; amount: number; compact?: boolean }> = ({
    good,
    amount,
    compact,
  }) => (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${GOOD_STYLES[good].badge}`}
    >
      {GOOD_STYLES[good].icon}
      {!compact && <span className="capitalize">{good}</span>}
      <span className="font-mono">{Number(amount).toFixed(1)}</span>
    </span>
  );

  /* ---- Inventory display ---- */
  const InventoryDisplay: React.FC<{ inv: Inventory; compact?: boolean }> = ({
    inv,
    compact,
  }) => (
    <div className={`flex ${compact ? 'gap-1' : 'gap-2'} flex-wrap`}>
      {ALL_GOODS.map((g) => (
        <GoodBadge key={g} good={g} amount={inv[g]} compact={compact} />
      ))}
    </div>
  );

  /* ---- Visible offers (filtered by scope) ---- */
  const visibleOffers = offers.filter(
    (o) => o.scope === 'global' || o.village === village
  );
  const myOffers = visibleOffers.filter((o) => o.playerId === playerId);
  const otherOffers = visibleOffers.filter((o) => o.playerId !== playerId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* ====== LEFT COLUMN: Player Info ====== */}
      <div className="lg:col-span-3 space-y-4">
        {/* Village Card */}
        <Card className={`bg-gray-800/80 border-2 ${villageInfo.borderColor}`}>
          <div className="text-center mb-3">
            <Anchor className="w-6 h-6 mx-auto text-amber-400 mb-1" />
            <div className="text-xs text-gray-400 uppercase tracking-wider">Your Port</div>
            <div className={`text-xl font-bold text-amber-200`}>{villageInfo.name}</div>
            <div className="text-xs text-gray-500 mt-1">
              Produces:{' '}
              {villageInfo.goods.map((g, i) => (
                <span key={g}>
                  {i > 0 && ' & '}
                  <span className={GOOD_STYLES[g].text + ' font-medium capitalize'}>{g}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Phase Indicator */}
          <div className="flex gap-1 mb-3">
            {(['production', 'trade', 'results'] as const).map((p) => (
              <div
                key={p}
                className={`flex-1 text-center py-1 rounded text-[10px] font-medium capitalize ${
                  phase === p
                    ? 'bg-amber-600/40 text-amber-200 ring-1 ring-amber-500/50'
                    : 'bg-gray-700/40 text-gray-500'
                }`}
              >
                {p}
              </div>
            ))}
          </div>

          {/* Current Inventory */}
          <div className="bg-gray-700/40 rounded-lg p-3">
            <div className="text-xs text-amber-400/70 font-medium uppercase tracking-wide mb-2">
              Cargo Hold
            </div>
            <InventoryDisplay inv={inventory} />
          </div>
        </Card>

        {/* Total Profit */}
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              <span className="font-medium text-amber-200">Total Profit</span>
            </div>
            <span
              className={`text-2xl font-bold ${
                (Number(player?.total_profit) || 0) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              ${Number(player?.total_profit || 0).toFixed(2)}
            </span>
          </div>
        </Card>

        {/* Trade History (compact) */}
        {tradeHistory.length > 0 && (
          <Card className="bg-gray-800/80 border border-gray-700/50">
            <div className="font-semibold text-amber-200 text-sm mb-2">
              Recent Voyages ({tradeHistory.length})
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {[...tradeHistory].reverse().slice(0, 10).map((t, i) => (
                <div key={t.tradeId || i} className="text-xs bg-gray-700/20 rounded p-1.5">
                  <span className="text-gray-400">{t.offererName}</span>
                  <span className="text-gray-600 mx-1">&rarr;</span>
                  <span className="text-gray-400">{t.accepterName}</span>
                  <div className="flex gap-2 mt-0.5">
                    <GoodBadge good={t.offerGood} amount={t.offerAmount} compact />
                    <span className="text-gray-600">for</span>
                    <GoodBadge good={t.wantGood} amount={t.wantAmount} compact />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* ====== CENTER: Phase-specific content ====== */}
      <div className="lg:col-span-5 space-y-4">
        <Card className="bg-gray-800/80 border border-gray-700/50 min-h-[350px]">
          <div className="flex items-center gap-2 mb-4">
            {phase === 'production' && <Package className="w-5 h-5 text-amber-400" />}
            {phase === 'trade' && <ArrowRightLeft className="w-5 h-5 text-amber-400" />}
            {phase === 'results' && <BarChart3 className="w-5 h-5 text-amber-400" />}
            {phase === 'waiting' && <Anchor className="w-5 h-5 text-amber-400" />}
            <span className="font-semibold text-amber-200">
              {phase === 'production' && 'Production'}
              {phase === 'trade' && 'The Open Seas - Trade'}
              {phase === 'results' && 'Voyage Complete'}
              {phase === 'waiting' && 'Awaiting Orders'}
            </span>
          </div>

          {!roundActive || !roundId ? (
            <div className="text-center py-12">
              <Anchor className="w-12 h-12 mx-auto text-gray-600 mb-4 opacity-40" />
              <p className="text-gray-400">Waiting for round to start...</p>
            </div>
          ) : phase === 'production' ? (
            /* ---- Production Phase ---- */
            submitted ? (
              <div className="text-center py-8">
                <div className="text-green-400 font-medium text-lg mb-2">
                  Production Plan Submitted!
                </div>
                <p className="text-gray-500 text-sm">Your workers are busy at the docks...</p>
                {waitingCount.total > 0 && (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-4">
                    <Users className="w-4 h-4" />
                    <span>{waitingCount.submitted}/{waitingCount.total} ports ready</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <p className="text-sm text-gray-400 text-center">
                  Allocate your labor between{' '}
                  <span className={GOOD_STYLES[villageInfo.goods[0]].text + ' font-medium capitalize'}>
                    {villageInfo.goods[0]}
                  </span>{' '}
                  and{' '}
                  <span className={GOOD_STYLES[villageInfo.goods[1]].text + ' font-medium capitalize'}>
                    {villageInfo.goods[1]}
                  </span>{' '}
                  goods production.
                </p>

                {/* Slider */}
                <div className="space-y-3">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>
                      {GOOD_STYLES[villageInfo.goods[0]].icon}{' '}
                      <span className={GOOD_STYLES[villageInfo.goods[0]].text + ' capitalize'}>
                        {villageInfo.goods[0]}
                      </span>
                    </span>
                    <span>
                      <span className={GOOD_STYLES[villageInfo.goods[1]].text + ' capitalize'}>
                        {villageInfo.goods[1]}
                      </span>{' '}
                      {GOOD_STYLES[villageInfo.goods[1]].icon}
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={allocation}
                    onChange={(e) => setAllocation(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />

                  <div className="text-center text-sm text-gray-400">
                    {allocation}% / {100 - allocation}%
                  </div>
                </div>

                {/* Production Preview */}
                <div className="bg-gray-700/40 rounded-lg p-4">
                  <div className="text-xs text-amber-400/70 font-medium uppercase tracking-wide mb-3">
                    Production Preview
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-2xl mb-1">{GOOD_STYLES[villageInfo.goods[0]].icon}</div>
                      <div className={`text-lg font-bold font-mono ${GOOD_STYLES[villageInfo.goods[0]].text}`}>
                        {productionPreview.good1.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-gray-500 capitalize">
                        {villageInfo.goods[0]} units
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl mb-1">{GOOD_STYLES[villageInfo.goods[1]].icon}</div>
                      <div className={`text-lg font-bold font-mono ${GOOD_STYLES[villageInfo.goods[1]].text}`}>
                        {productionPreview.good2.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-gray-500 capitalize">
                        {villageInfo.goods[1]} units
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleProduction}
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Confirm Production'}
                </Button>
              </div>
            )
          ) : phase === 'trade' ? (
            /* ---- Trade Phase ---- */
            <div className="space-y-4">
              {/* Current inventory reminder */}
              <div className="bg-gray-700/30 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Your Cargo</div>
                <InventoryDisplay inv={inventory} />
              </div>

              {/* Post offer form */}
              <form onSubmit={handlePostOffer} className="space-y-3">
                <div className="text-xs text-amber-400/70 font-medium uppercase tracking-wide">
                  Offering Cargo
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">You Offer</label>
                    <div className="flex gap-2">
                      <select
                        value={offerGood}
                        onChange={(e) => setOfferGood(e.target.value as GoodType)}
                        className="flex-1 bg-gray-700 border border-gray-600 text-gray-200 rounded px-2 py-1.5 text-sm focus:ring-amber-500 focus:border-amber-500"
                      >
                        {ALL_GOODS.map((g) => (
                          <option key={g} value={g}>
                            {GOOD_STYLES[g].icon} {g.charAt(0).toUpperCase() + g.slice(1)} ({inventory[g].toFixed(1)})
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max={inventory[offerGood]}
                        value={offerAmount}
                        onChange={(e) => setOfferAmount(e.target.value)}
                        placeholder="Amt"
                        className="w-20 bg-gray-700 border-gray-600 text-amber-100"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Seeking Goods</label>
                    <div className="flex gap-2">
                      <select
                        value={wantGood}
                        onChange={(e) => setWantGood(e.target.value as GoodType)}
                        className="flex-1 bg-gray-700 border border-gray-600 text-gray-200 rounded px-2 py-1.5 text-sm focus:ring-amber-500 focus:border-amber-500"
                      >
                        {ALL_GOODS.filter((g) => g !== offerGood).map((g) => (
                          <option key={g} value={g}>
                            {GOOD_STYLES[g].icon} {g.charAt(0).toUpperCase() + g.slice(1)}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={wantAmount}
                        onChange={(e) => setWantAmount(e.target.value)}
                        placeholder="Amt"
                        className="w-20 bg-gray-700 border-gray-600 text-amber-100"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Scope selector */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOfferScope('local')}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                      offerScope === 'local'
                        ? `${villageInfo.bgColor} ${villageInfo.borderColor} border text-amber-200`
                        : 'bg-gray-700/30 border border-gray-700/30 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Local ({villageInfo.name})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfferScope('global')}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                      offerScope === 'global'
                        ? 'bg-amber-900/30 border border-amber-600/40 text-amber-200'
                        : 'bg-gray-700/30 border border-gray-700/30 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    The Open Seas (All Ports)
                  </button>
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Posting...' : 'Post Trade Offer'}
                </Button>
              </form>

              {/* My active offers */}
              {myOffers.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 font-medium mb-2">
                    Your Active Offers ({myOffers.length})
                  </div>
                  <div className="space-y-1">
                    {myOffers.map((o) => (
                      <div
                        key={o.offerId}
                        className="flex items-center justify-between bg-amber-900/15 border border-amber-700/30 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <GoodBadge good={o.offerGood} amount={o.offerAmount} compact />
                          <span className="text-gray-500">for</span>
                          <GoodBadge good={o.wantGood} amount={o.wantAmount} compact />
                          <span className="text-[10px] text-gray-600">
                            ({o.scope === 'local' ? 'local' : 'open seas'})
                          </span>
                        </div>
                        <button
                          onClick={() => handleCancelOffer(o.offerId)}
                          className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded hover:bg-red-900/20 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : phase === 'results' ? (
            /* ---- Results Phase ---- */
            <div className="space-y-4">
              {/* My earnings */}
              {myResult && (
                <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-4 text-center">
                  <div className="text-sm text-gray-400 mb-1">Your Earnings This Round</div>
                  <div className="text-3xl font-bold font-mono text-green-400">
                    ${Number(myResult.earnings).toFixed(2)}
                  </div>
                  {myResult.autarkyEarnings !== undefined && (
                    <div className="text-xs text-gray-500 mt-2">
                      Autarky benchmark: ${Number(myResult.autarkyEarnings).toFixed(2)}
                      {Number(myResult.earnings) > Number(myResult.autarkyEarnings) ? (
                        <span className="text-green-400 ml-1">
                          (+${(Number(myResult.earnings) - Number(myResult.autarkyEarnings)).toFixed(2)} from trade)
                        </span>
                      ) : (
                        <span className="text-red-400 ml-1">
                          ({(Number(myResult.earnings) - Number(myResult.autarkyEarnings)).toFixed(2)} vs autarky)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Final inventory */}
              {myResult?.inventory && (
                <div className="bg-gray-700/30 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-2">Final Cargo</div>
                  <InventoryDisplay inv={myResult.inventory} />
                </div>
              )}

              {/* Village aggregates */}
              {villageAggregates.length > 0 && (
                <div>
                  <div className="text-xs text-amber-400/70 font-medium uppercase tracking-wide mb-2">
                    Port Standings
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {villageAggregates.map((va) => {
                      const vInfo = VILLAGE_CONFIG[va.village] || VILLAGE_CONFIG[1];
                      const isMyVillage = va.village === village;
                      return (
                        <div
                          key={va.village}
                          className={`rounded-lg p-3 text-center border ${
                            isMyVillage
                              ? `${vInfo.bgColor} ${vInfo.borderColor} border-2`
                              : 'bg-gray-700/20 border-gray-700/30'
                          }`}
                        >
                          <div className="text-xs text-gray-400 font-medium mb-1">
                            {vInfo.name}
                            {isMyVillage && <span className="text-amber-400 ml-1">(You)</span>}
                          </div>
                          <div className="text-lg font-bold text-amber-200 font-mono">
                            ${Number(va.totalEarnings).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            Avg: ${Number(va.averageEarnings).toFixed(2)} | {va.playerCount} players
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All player results */}
              {playerResults.length > 0 && (
                <div>
                  <div className="text-xs text-amber-400/70 font-medium uppercase tracking-wide mb-2">
                    All Players
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {[...playerResults]
                      .sort((a, b) => Number(b.earnings) - Number(a.earnings))
                      .map((pr) => {
                        const vInfo = VILLAGE_CONFIG[pr.village] || VILLAGE_CONFIG[1];
                        const isMe = pr.playerId === playerId;
                        return (
                          <div
                            key={pr.playerId}
                            className={`flex items-center justify-between rounded px-3 py-1.5 text-xs ${
                              isMe
                                ? 'bg-sky-900/30 border border-sky-700/40'
                                : 'bg-gray-700/20'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${vInfo.borderColor.replace('border', 'bg').replace('/60', '')}`} />
                              <span className="text-gray-300 font-medium">
                                {isMe ? 'You' : pr.playerName}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                {vInfo.name}
                              </span>
                            </div>
                            <span
                              className={`font-mono font-medium ${
                                Number(pr.earnings) > 0 ? 'text-green-400' : 'text-gray-500'
                              }`}
                            >
                              ${Number(pr.earnings).toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ---- Waiting ---- */
            <div className="text-center py-12">
              <Anchor className="w-12 h-12 mx-auto text-gray-600 mb-4 opacity-40" />
              <p className="text-gray-400">Preparing the voyage...</p>
            </div>
          )}
        </Card>
      </div>

      {/* ====== RIGHT COLUMN: Trade Offers Board ====== */}
      <div className="lg:col-span-4 space-y-4">
        <Card className="bg-gray-800/80 border border-gray-700/50">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRightLeft className="w-5 h-5 text-amber-400" />
            <span className="font-semibold text-amber-200">Trade Board</span>
            {otherOffers.length > 0 && (
              <span className="text-xs bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full ml-auto">
                {otherOffers.length} offers
              </span>
            )}
          </div>

          {phase === 'trade' && otherOffers.length > 0 ? (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {otherOffers.map((o) => {
                const oVillage = VILLAGE_CONFIG[o.village] || VILLAGE_CONFIG[1];
                const canAfford = inventory[o.wantGood] >= o.wantAmount;
                return (
                  <div
                    key={o.offerId}
                    className={`rounded-lg p-3 border transition-colors ${
                      o.scope === 'global'
                        ? 'bg-amber-900/10 border-amber-700/30'
                        : `${oVillage.bgColor} ${oVillage.borderColor}`
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-300 font-medium">
                          {o.playerName}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {oVillage.name}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          o.scope === 'global'
                            ? 'bg-amber-900/40 text-amber-300'
                            : 'bg-gray-700/40 text-gray-500'
                        }`}
                      >
                        {o.scope === 'global' ? 'Open Seas' : 'Local'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-2 text-xs">
                      <span className="text-gray-500">Offers:</span>
                      <GoodBadge good={o.offerGood} amount={o.offerAmount} />
                      <span className="text-gray-500 mx-1">for</span>
                      <GoodBadge good={o.wantGood} amount={o.wantAmount} />
                    </div>

                    <button
                      onClick={() => handleAcceptOffer(o.offerId)}
                      disabled={!canAfford}
                      className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${
                        canAfford
                          ? 'bg-green-700/40 text-green-300 hover:bg-green-700/60 border border-green-600/40'
                          : 'bg-gray-700/20 text-gray-600 cursor-not-allowed border border-gray-700/30'
                      }`}
                    >
                      {canAfford ? 'Accept Trade' : `Need ${o.wantAmount.toFixed(1)} ${o.wantGood}`}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : phase === 'trade' ? (
            <div className="text-center py-8 text-gray-500">
              <ArrowRightLeft className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No trade offers on the board yet.</p>
              <p className="text-xs text-gray-600 mt-1">Post an offer to start trading!</p>
            </div>
          ) : phase === 'results' ? (
            /* Show completed trades during results */
            tradeHistory.length > 0 ? (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                <div className="text-xs text-gray-500 mb-2">
                  {tradeHistory.length} trades completed this round
                </div>
                {[...tradeHistory].reverse().map((t, i) => (
                  <div key={t.tradeId || i} className="bg-gray-700/20 rounded p-2 text-xs">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-gray-400">{t.offererName}</span>
                      <span className="text-gray-600">&harr;</span>
                      <span className="text-gray-400">{t.accepterName}</span>
                    </div>
                    <div className="flex gap-2">
                      <GoodBadge good={t.offerGood} amount={t.offerAmount} compact />
                      <span className="text-gray-600">for</span>
                      <GoodBadge good={t.wantGood} amount={t.wantAmount} compact />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No trades this round.</p>
              </div>
            )
          ) : (
            <div className="text-center py-8 text-gray-500">
              <ArrowRightLeft className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Trading board opens during the trade phase.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ThreeVillageTradeUI;
