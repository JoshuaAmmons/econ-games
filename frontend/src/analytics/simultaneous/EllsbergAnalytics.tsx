import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, LabelList, Cell,
} from 'recharts';
import { ChartCard } from '../../components/charts/ChartCard';
import { CHART_MARGINS } from '../../components/charts/chartUtils';
import type { AnalyticsProps } from '../AnalyticsRegistry';

// Sized to be read on a projector
const TICK = { fontSize: 14 };
const HEIGHT = 340;
const KNOWN = '#0ea5e9';
const AMBIGUOUS = '#f59e0b';
// the site is dark-themed: inline chart text must be light
const TEXT = '#e5e7eb';
const MUTED = '#9ca3af';

interface Choice {
  round: number;
  urn: 'known' | 'ambiguous';
  color: string;
  correct: boolean;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

const Stat: React.FC<{ value: string; label: string; sub?: string }> = ({ value, label, sub }) => (
  <div className="bg-white rounded-lg shadow p-4 text-center">
    <div className="text-3xl font-bold text-sky-700">{value}</div>
    <div className="text-sm font-medium text-gray-700 mt-1">{label}</div>
    {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
  </div>
);

/**
 * Ellsberg urn choice: the debrief is ambiguity aversion. Students prefer the urn with known odds (50 red, 50 black)
 * to the urn with an unknown mix, and a belief about the unknown mix cannot explain a preference that holds whether
 * the bet is on red or on black.
 */
const EllsbergAnalytics: React.FC<AnalyticsProps> = ({ completedRounds }) => {
  const choices = useMemo(() => {
    const out: Choice[] = [];
    for (const round of completedRounds) {
      for (const r of round.results || []) {
        const rd = r.resultData || {};
        if (rd.urn !== 'known' && rd.urn !== 'ambiguous') continue;
        out.push({ round: round.roundNumber, urn: rd.urn, color: String(rd.color || ''), correct: !!rd.correct });
      }
    }
    return out;
  }, [completedRounds]);

  const byRound = useMemo(() => {
    const rounds = [...new Set(choices.map(c => c.round))].sort((a, b) => a - b);
    return rounds.map(rn => {
      const cs = choices.filter(c => c.round === rn);
      const known = cs.filter(c => c.urn === 'known').length;
      const knownShare = pct(known, cs.length);
      return { round: `R${rn}`, known: knownShare, ambiguous: cs.length ? 100 - knownShare : 0, n: cs.length, knownN: known };
    });
  }, [choices]);

  const byColour = useMemo(() => (['red', 'black'] as const).map(col => {
    const cs = choices.filter(c => c.color === col);
    const known = cs.filter(c => c.urn === 'known').length;
    return {
      bet: col === 'red' ? 'Bet on red' : 'Bet on black',
      color: col,
      knownShare: pct(known, cs.length),
      label: cs.length ? `${pct(known, cs.length)}% (${known} of ${cs.length})` : 'no bets',
    };
  }), [choices]);

  const payoffs = useMemo(() => (['known', 'ambiguous'] as const).map(u => {
    const cs = choices.filter(c => c.urn === u);
    const won = cs.filter(c => c.correct).length;
    return {
      urn: u === 'known' ? 'Known urn' : 'Ambiguous urn',
      key: u,
      winRate: pct(won, cs.length),
      label: cs.length ? `${pct(won, cs.length)}% (${won} of ${cs.length})` : 'not chosen',
    };
  }), [choices]);

  if (choices.length === 0) return null;

  const knownTotal = choices.filter(c => c.urn === 'known').length;
  const red = byColour[0];
  const black = byColour[1];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat value={`${pct(knownTotal, choices.length)}%`} label="Chose the known urn"
              sub={`${knownTotal} of ${choices.length} choices, all rounds`} />
        <Stat value={`${red.knownShare}%`} label="Betting red: chose the known urn" sub={red.label} />
        <Stat value={`${black.knownShare}%`} label="Betting black: chose the known urn" sub={black.label} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Urn Chosen, Round by Round"
                   description="Share of choices for the known urn (50 red, 50 black) and the ambiguous urn (unknown mix) in each round">
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <BarChart data={byRound} margin={CHART_MARGINS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="round" tick={TICK} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: any) => `${v}%`} tick={TICK} />
              <Tooltip formatter={(v: any, name: any) => [`${v}%`, name]} />
              <Legend wrapperStyle={{ fontSize: 14 }} />
              <ReferenceLine y={50} stroke={MUTED} strokeDasharray="5 5" />
              <Bar dataKey="known" name="Known urn" stackId="urn" fill={KNOWN}>
                <LabelList dataKey="known" position="center" formatter={(v: any) => (Number(v) >= 12 ? `${v}%` : '')}
                           style={{ fill: '#fff', fontSize: 14, fontWeight: 600 }} />
              </Bar>
              <Bar dataKey="ambiguous" name="Ambiguous urn" stackId="urn" fill={AMBIGUOUS}>
                <LabelList dataKey="ambiguous" position="center" formatter={(v: any) => (Number(v) >= 12 ? `${v}%` : '')}
                           style={{ fill: '#fff', fontSize: 14, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Known Urn, by Colour Bet"
                   description="Among students betting red, and among students betting black, the share who drew from the known urn. A belief that the ambiguous urn is short of one colour pushes red and black bettors opposite ways; a known-urn majority in both groups is the Ellsberg pattern.">
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <BarChart data={byColour} margin={{ ...CHART_MARGINS, top: 30, right: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="bet" tick={TICK} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: any) => `${v}%`} tick={TICK} />
              <Tooltip formatter={(v: any) => [`${v}%`, 'Chose the known urn']} />
              <ReferenceLine y={50} stroke={MUTED} strokeDasharray="5 5"
                             label={{ value: '50%', position: 'right', fontSize: 13, fill: MUTED }} />
              <Bar dataKey="knownShare" name="Chose the known urn" radius={[4, 4, 0, 0]}>
                {byColour.map(d => <Cell key={d.color} fill={d.color === 'red' ? '#dc2626' : '#374151'} stroke={TEXT} strokeWidth={d.color === 'red' ? 0 : 2} />)}
                <LabelList dataKey="label" position="top" style={{ fontSize: 15, fill: TEXT, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="How Often Each Urn Paid"
                   description="Share of choices that won the prize, by urn. Both urns pay with the same 50% chance; one ball is drawn from each urn per round, so everyone who chose an urn shares that round's luck.">
          <ResponsiveContainer width="100%" height={HEIGHT}>
            <BarChart data={payoffs} margin={{ ...CHART_MARGINS, top: 30, right: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="urn" tick={TICK} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: any) => `${v}%`} tick={TICK} />
              <Tooltip formatter={(v: any) => [`${v}%`, 'Won the prize']} />
              <ReferenceLine y={50} stroke={MUTED} strokeDasharray="5 5"
                             label={{ value: 'Chance: 50%', position: 'right', fontSize: 13, fill: MUTED }} />
              <Bar dataKey="winRate" name="Won the prize" radius={[4, 4, 0, 0]}>
                {payoffs.map(d => <Cell key={d.key} fill={d.key === 'known' ? KNOWN : AMBIGUOUS} />)}
                <LabelList dataKey="label" position="top" style={{ fontSize: 15, fill: TEXT, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

export default EllsbergAnalytics;
