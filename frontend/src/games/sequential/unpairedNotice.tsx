import React, { useEffect, useState } from 'react';

/**
 * The line a paired-game student sees when their pair has no result for the round: their partner (or
 * they) did not act before time ran out, they had no partner, or their partner left. The server marks
 * these players' $0 results with a reason (SequentialBaseEngine.processRoundEnd) and sends them in the
 * 'unpaired-results' event; until 19 Nov 2026 no screen showed it, so those students saw nothing.
 */
export function unpairedMessage(reason?: string | null): string {
  switch (reason) {
    case 'unpaired':
      return 'You had no partner this round, so you earned $0.';
    case 'partner_disconnected':
      return 'Your partner left the game, so you earned $0 this round.';
    case 'did_not_submit':
      return 'You did not act this round, so you and your partner both earned $0.';
    case 'partner_did_not_respond':
    case 'partner_did_not_submit':
    default:
      return 'Your partner did not act this round, so you both earned $0.';
  }
}

interface NoticeArgs {
  onEvent: (event: string, handler: (...args: any[]) => void) => () => void;
  playerId: string;
  roundId: string | null;
  roundActive: boolean;
}

/**
 * This player's no-result line for the current round, or null. Set by the 'unpaired-results' event,
 * by a pair in 'round-results' whose partner left, or by the game state after a reload
 * (myUnpairedResult); cleared when a new round starts.
 */
export function useUnpairedNotice({ onEvent, playerId, roundId, roundActive }: NoticeArgs): string | null {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (roundActive && roundId) setMessage(null);
  }, [roundId, roundActive]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    cleanups.push(onEvent('unpaired-results', (data: { roundId?: string; unpairedPlayers?: Array<{ playerId: string; resultData?: { reason?: string } }> }) => {
      if (data?.roundId && roundId && data.roundId !== roundId) return;
      const mine = (data?.unpairedPlayers || []).find((p) => p.playerId === playerId);
      if (mine) setMessage(unpairedMessage(mine.resultData?.reason));
    }));
    cleanups.push(onEvent('round-results', (data: { pairs?: Array<{ firstMoverId: string; secondMoverId: string; partnerDisconnected?: boolean }> }) => {
      const mine = (data?.pairs || []).find((p) => p.firstMoverId === playerId || p.secondMoverId === playerId);
      if (mine?.partnerDisconnected) setMessage(unpairedMessage('partner_disconnected'));
    }));
    cleanups.push(onEvent('game-state', (state: { myUnpairedResult?: { reason?: string } | null }) => {
      if (state?.myUnpairedResult) setMessage(unpairedMessage(state.myUnpairedResult.reason));
    }));
    return () => cleanups.forEach((fn) => fn());
  }, [onEvent, playerId, roundId]);

  return message;
}

/** The no-result line, styled for the Round Results card. */
export const UnpairedNotice: React.FC<{ message: string }> = ({ message }) => (
  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
    {message}
  </div>
);
