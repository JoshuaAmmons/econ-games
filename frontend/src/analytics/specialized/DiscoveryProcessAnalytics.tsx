import React, { useMemo } from 'react';
import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_MARGINS } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

// Sized to be read on a projector; the site is dark-themed, so lines that sit on the plot are light
const TICK = { fontSize: 14 };
const HEIGHT = 340;
const BIG = '#f59e0b';
const SMALL = '#0ea5e9';
const OUT = '#6b7280';
const GIFT = '#10b981';
const POT = '#a78bfa';
const TAKEN = '#ef4444';
const EATEN = '#10b981';
const WASTED = '#9ca3af';
const NEED = '#e5e7eb';
const AVG = '#e5e7eb';

const Stat: React.FC<{ value: string; label: string; sub?: string }> = ({ value, label, sub }) => (
  <div className="bg-white rounded-lg shadow p-4 text-center">
    <div className="text-3xl font-bold text-sky-700">{value}</div>
    <div className="text-sm font-medium text-gray-700 mt-1">{label}</div>
    {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
  </div>
);

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const num = (v: any) => Number(v || 0);

/**
 * Discovery Process (the hunter-gatherer island): the Chapter 6 debrief asks who hunted big game, whether gifts or
 * food pots appeared and when, and what happened to a big catch that one hunter could not eat. The engine records
 * each player's side in the hunt, food held, eaten and wasted at camp, and health (results), and every catch, gift,
 * take, pot deposit and withdrawal, stun and chat (actions). The island's numbers come from the results' own record of
 * the session's settings.
 */
const DiscoveryProcessAnalytics: React.FC<AnalyticsProps> = ({ completedRounds }) => {
  const rounds = useMemo(() => {
    return [...completedRounds]
      .sort((a, b) => a.roundNumber - b.roundNumber)
      .map(round => {
        const results = (round.results || []).filter(r => r.resultData && r.resultData.health != null);
        const actions = round.actions || [];
        const of = (type: string) => actions.filter(a => a.actionType === type);
        const catches = of('capture_prey');
        const big = catches.filter(a => a.actionData?.preyType === 'large');
        const small = catches.filter(a => a.actionData?.preyType === 'small');
        const island = results.find(r => r.resultData?.island)?.resultData?.island || null;

        // Where each player hunted: recorded directly since 18 Nov 2026; for older sessions, from the catches
        const sideRecorded = results.some(r => r.resultData?.huntSide !== undefined);
        let bigHunters: number, smallHunters: number, stayedOut: number;
        if (sideRecorded) {
          bigHunters = results.filter(r => r.resultData.huntSide === 'left').length;
          smallHunters = results.filter(r => r.resultData.huntSide === 'right').length;
          stayedOut = results.length - bigHunters - smallHunters;
        } else {
          const bigIds = new Set(big.map(a => a.playerId));
          const smallIds = new Set(small.map(a => a.playerId).filter(id => !bigIds.has(id)));
          bigHunters = bigIds.size;
          smallHunters = smallIds.size;
          stayedOut = Math.max(0, results.length - bigHunters - smallHunters);
        }

        const healths = results.map(r => num(r.resultData.health));
        const eatenRecorded = results.some(r => r.resultData?.foodEaten !== undefined);
        return {
          round: round.roundNumber,
          label: `R${round.roundNumber}`,
          players: results.length,
          sideRecorded,
          bigHunters, smallHunters, stayedOut,
          bigAttempts: big.length,
          bigCatches: big.filter(a => a.actionData?.captured).length,
          bigFood: sum(big.map(a => num(a.actionData?.foodGained))),
          smallFood: sum(small.map(a => num(a.actionData?.foodGained))),
          gifts: of('transfer').length,
          giftFood: sum(of('transfer').map(a => num(a.actionData?.amount))),
          potIn: sum(of('deposit_pot').map(a => num(a.actionData?.amount))),
          potOut: sum(of('withdraw_pot').map(a => num(a.actionData?.amount))),
          potsPlaced: of('place_pot').length,
          takes: of('take').length,
          takenFood: sum(of('take').map(a => num(a.actionData?.amount))),
          stuns: of('stun').length,
          chats: of('chat').length,
          eaten: eatenRecorded ? sum(results.map(r => num(r.resultData.foodEaten))) : null,
          wasted: eatenRecorded
            ? sum(results.map(r => num(r.resultData.foodWasted))) + num(island?.potFoodLeft)
            : null,
          avgHealth: healths.length ? parseFloat((sum(healths) / healths.length).toFixed(1)) : null,
          minHealth: healths.length ? Math.min(...healths) : null,
          maxHealth: healths.length ? Math.max(...healths) : null,
          island,
        };
      })
      .filter(r => r.players > 0);
  }, [completedRounds]);

  if (rounds.length === 0) return null;

  const island = rounds.find(r => r.island)?.island || null;
  // the health the island burns each round, and the big game on offer if every animal is tried
  const need = island ? num(island.players) * num(island.healthDecay) : null;
  const bigOnOffer = island ? num(island.largePrey) * num(island.largePreyValue) * num(island.largePreyCaptureProb) : null;
  const smallOnOffer = island ? num(island.smallPrey) * num(island.smallPreyValue) : null;
  const startHealth = island ? num(island.startHealth) : null;
  // the food axis must reach the need line, or the chart drops it (it sits above the bars when the island goes hungry)
  const foodTop = Math.ceil((Math.max(...rounds.map(r => r.bigFood + r.smallFood), need ?? 0) * 1.1) / 20) * 20;
  const maxHealthCap = island ? num(island.maxHealth) : 100;

  const first = rounds[0];
  const last = rounds[rounds.length - 1];
  const caught = sum(rounds.map(r => r.bigFood + r.smallFood));
  const shared = sum(rounds.map(r => r.giftFood + r.potIn));
  const wastedTotal = rounds.every(r => r.wasted != null) ? sum(rounds.map(r => r.wasted as number)) : null;
  const firstShare = rounds.find(r => r.gifts > 0 || r.potIn > 0);

  const sideNote = first.sideRecorded
    ? 'The side each player took in the hunt (big game on the left, small game on the right).'
    : 'Counted from catches, since this session predates the record of sides: a big-game hunter who never reached an animal counts as having stayed out.';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat value={`${first.bigHunters} → ${last.bigHunters}`} label="Hunted big game"
              sub={`round ${first.round} to round ${last.round}, of ${last.players} players`} />
        <Stat value={`${shared}`} label="Food shared" sub={firstShare
          ? `gifts and pot deposits; first in round ${firstShare.round}`
          : 'no gifts or pot deposits'} />
        <Stat value={wastedTotal != null ? `${wastedTotal}` : 'not recorded'} label="Food wasted"
              sub={wastedTotal != null && caught > 0 ? `${Math.round((100 * wastedTotal) / caught)}% of the ${caught} caught` : undefined} />
        <Stat value={`${first.avgHealth ?? '-'} → ${last.avgHealth ?? '-'}`} label="Average health"
              sub={startHealth != null ? `after round ${first.round} and round ${last.round}; everyone started at ${startHealth}` : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Who Hunted Where"
                   description={`Players on each side of the hunt, round by round. ${sideNote}`}>
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <BarChart data={rounds} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={TICK} />
              <YAxis allowDecimals={false} tick={TICK} label={{ value: 'Players', angle: -90, position: 'insideLeft', fontSize: 14 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 14 }} />
              <Bar dataKey="bigHunters" name="Big game" stackId="s" fill={BIG} />
              <Bar dataKey="smallHunters" name="Small game" stackId="s" fill={SMALL} />
              <Bar dataKey="stayedOut" name="Stayed out" stackId="s" fill={OUT} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Food Caught Against What the Island Needs"
                   description={need != null
                     ? `Food caught each round, by kind of game. The line is the health the island loses each round (${island.players} players × ${island.healthDecay}). If every big animal is tried, big game yields about ${Math.round(bigOnOffer as number)} food a round; small game offers ${smallOnOffer}.`
                     : 'Food caught each round, by kind of game.'}>
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <ComposedChart data={rounds} margin={{ ...CHART_MARGINS, right: 110 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={TICK} />
              <YAxis domain={[0, foodTop]} tick={TICK} label={{ value: 'Food', angle: -90, position: 'insideLeft', fontSize: 14 }} />
              <Tooltip formatter={(v: any, name: any, item: any) => {
                if (name === 'Big game') return [`${v} (${item.payload.bigCatches} of ${item.payload.bigAttempts} tries caught)`, name];
                return [v, name];
              }} />
              <Legend wrapperStyle={{ fontSize: 14 }} />
              {need != null && (
                <ReferenceLine y={need} stroke={NEED} strokeWidth={2} strokeDasharray="6 4"
                               label={{ value: `Health lost ${need}`, position: 'right', fontSize: 14, fill: NEED }} />
              )}
              <Bar dataKey="bigFood" name="Big game" stackId="f" fill={BIG} />
              <Bar dataKey="smallFood" name="Small game" stackId="f" fill={SMALL} radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sharing and Taking"
                   description="Food given as gifts, put into food pots, and taken by stun-and-take, round by round. Hover a bar for how many times each happened.">
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <BarChart data={rounds} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={TICK} />
              <YAxis allowDecimals={false} tick={TICK} label={{ value: 'Food', angle: -90, position: 'insideLeft', fontSize: 14 }} />
              <Tooltip formatter={(v: any, name: any, item: any) => {
                const p = item.payload;
                if (name === 'Gifts') return [`${v} food in ${p.gifts} gift${p.gifts === 1 ? '' : 's'}`, name];
                if (name === 'Into pots') return [`${v} food (${p.potsPlaced} pot${p.potsPlaced === 1 ? '' : 's'} placed, ${p.potOut} taken out)`, name];
                if (name === 'Taken') return [`${v} food in ${p.takes} take${p.takes === 1 ? '' : 's'} (${p.stuns} stun${p.stuns === 1 ? '' : 's'})`, name];
                return [v, name];
              }} />
              <Legend wrapperStyle={{ fontSize: 14 }} />
              <Bar dataKey="giftFood" name="Gifts" fill={GIFT} radius={[4, 4, 0, 0]} />
              <Bar dataKey="potIn" name="Into pots" fill={POT} radius={[4, 4, 0, 0]} />
              <Bar dataKey="takenFood" name="Taken" fill={TAKEN} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {rounds.every(r => r.eaten != null) && (
          <ChartCard title="Eaten and Wasted"
                     description="The food players held at camp: what turned into health, and what was wasted because the player was already at full health or past the hearth's limit, plus food left in pots.">
            <ResponsiveContainer width="100%" height={HEIGHT}>
              <BarChart data={rounds} margin={CHART_MARGINS}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={TICK} />
                <YAxis allowDecimals={false} tick={TICK} label={{ value: 'Food', angle: -90, position: 'insideLeft', fontSize: 14 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 14 }} />
                <Bar dataKey="eaten" name="Eaten" stackId="e" fill={EATEN} />
                <Bar dataKey="wasted" name="Wasted" stackId="e" fill={WASTED} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <ChartCard title="Health Each Round"
                   description={`Average, lowest and highest health after each round's camp${startHealth != null ? `; everyone started at ${startHealth}` : ''}. Earnings each round are health × ${island ? island.earningsMultiplier : 'the earnings rate'}.`}>
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <ComposedChart data={rounds} margin={{ ...CHART_MARGINS, right: 90 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={TICK} />
              <YAxis domain={[0, maxHealthCap]} tick={TICK} label={{ value: 'Health', angle: -90, position: 'insideLeft', fontSize: 14 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 14 }} />
              {startHealth != null && (
                <ReferenceLine y={startHealth} stroke={NEED} strokeWidth={2} strokeDasharray="4 4"
                               label={{ value: `Start ${startHealth}`, position: 'right', fontSize: 14, fill: NEED }} />
              )}
              <Line dataKey="maxHealth" name="Highest" stroke={GIFT} strokeWidth={2} dot={{ r: 4 }} />
              <Line dataKey="avgHealth" name="Average" stroke={AVG} strokeWidth={3} dot={{ r: 5 }} />
              <Line dataKey="minHealth" name="Lowest" stroke={TAKEN} strokeWidth={2} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

export default DiscoveryProcessAnalytics;
