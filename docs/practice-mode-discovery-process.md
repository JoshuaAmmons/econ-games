# Practice mode for Discovery Process — follow-up spec

**Status update (2026-05-06):** the minimum-viable build has shipped. Solo +
bots Discovery Process is live in production at
`/api/practice/discovery_process/start` (4 seats × 3 rounds × 120 s, compact
4200 × 700 arena, 8 large + 16 small prey). End-to-end integration tests pass
5/5 — sessions create cleanly, the round-ended event fires with all four
players reported, and the human is included in results. What's still
deferred to a future sprint: **upgrading the bot strategy from random
walk + random capture attempts to position-aware archetypes** (loner /
coordinator / mixed). With the current bots, all four players consistently
finish a round at the health-only floor (≈ 0.77 profit) because the bots
rarely land within the 100 px capture radius of any prey by luck alone. A
student playing in the UI captures their own prey and earns a real profit;
the bots are just passive companions in this v1.

## Why Discovery Process belongs in Chapter 6

Chapter 6 of the textbook is *Organizational Design*. The recurring themes are
collective action, free-riding under shared output, the discovery of where
value is to be produced, and the boundary between coordination through prices
and coordination through hierarchy.

The Discovery Process engine (a real-time 2D hunter-gatherer arena, by
construction a Hayekian decentralized-knowledge game) is the right fit:

- **Free-riding under shared production.** Large prey require multiple
  gatherers and have a 25 % capture probability; small prey are easy and
  individual. Students experience the cost of free-riding directly — go alone
  to the small-prey side and you eat reliably; commit to the risky large-prey
  side and your payoff depends on whether others show up.
- **Discovery in the Hayekian sense.** Each player has a `visibilityRadius`
  (default 1000 px) inside a 10 080 px world. No central planner sees the
  whole board. The student forms a private model of where prey is, where
  others are headed, and which trades are worth making in the middle zone.
- **Hierarchy versus prices.** The trading-phase (60 s) middle zone is a
  decentralized barter market. Watching the price of "one large-prey unit"
  emerge from voluntary deposits and pickups is a microcosm of the
  Coase/Williamson question: when does the firm internalize the trade and
  when does the market handle it?

This is the same intellectual territory as Chapter 6's case studies
(Amazon flywheel, JPMorgan disciplined balance-sheet, common-pool resources)
but in playable form.

## What's already in place

The engine is implemented end-to-end:

- `backend/src/engines/specialized/DiscoveryProcessEngine.ts` —
  the full simulation: 10 ticks/sec, three phases (hunting / trading /
  interim), prey AI, stun and tug-of-war mechanics, hearth deposits,
  per-round earnings.
- `backend/src/services/botStrategies/SpecializedBotStrategies.ts:181` —
  `discoveryProcessStrategy.getSpecializedActions` already emits a sequence
  of `set_target` and `capture_prey` commands with delays, so bots will
  move and hunt in solo+bots mode out of the box.
- `frontend/src/games/specialized/DiscoveryProcessUI.tsx` — the pixi.js
  arena, mini-map, action panel.
- `frontend/src/analytics/specialized/DiscoveryProcessAnalytics.tsx` — the
  post-round analytics view.

So the critical infrastructure is there; this spec is the last mile.

## What's already done (v1, 2026-05-06)

1. **Practice config** — entry added in `backend/src/services/practiceConfigs.ts`
   with `market_size: 4`, `num_rounds: 3`, `time_per_round: 120`, and a
   compact 4200 × 700 arena (8 large + 16 small prey).
2. **Human role** — `PRACTICE_HUMAN_ROLES.discovery_process = 'producer'`.
   (The engine's UI config labels the role `'gatherer'`, but the database
   `role_check` constraint enforces `'producer'`; aligning with the
   constraint avoids a schema migration.)
3. **Bot strategy bug fix** — the existing `getSpecializedActions` was
   hardcoding `prey_1..prey_20`/`prey_40`, but the engine assigns
   sequential IDs across both prey types: large at `prey_1..prey_largePrey`
   and small at `prey_(largePrey+1)..prey_(largePrey+smallPrey)`. The bot
   now reads the counts from `config` and uses the correct ID range.
4. **End-to-end test** — `node test-practice.js discovery_process 5`
   passes 5/5; all four players reported in `round-ended`. The test
   harness was extended to handle DP's alternative `round-ended` payload
   shape (`results: [...]`) which differs from the canonical
   `results: { playerResults }`.

## What's still missing (v2, future sprint)

1. **Position-aware bots.** v1 bots do random walks and fire captures at
   random prey IDs. They rarely land within the 100 px capture radius by
   luck, so all four players (1 human + 3 bots) tend to finish at the
   health-only floor unless the human plays actively in the UI. v2
   should split into three archetypes that *track prey state* (the
   `getSpecializedActions` interface would need to be enriched with a
   live game-state callback, or replaced with a tick-driven hook):
   - *Loner*: always small-prey side, walks toward nearest small prey,
     never trades (free-riding baseline).
   - *Coordinator*: large-prey side, walks toward nearest large prey,
     deposits into shared pots, picks up others' deposits during the
     trade phase.
   - *Mixed*: hunts large prey when health is high, falls back to small
     prey when health is low (rational risk-averse).
   Mixing one of each in a 4-player session would let the student see
   all three patterns in a single run.
2. **Frontend solo-mode polish.** The `/session/:code/market` route
   already renders `DiscoveryProcessUI` for both admin-led and practice
   sessions, but the practice-mode entry has not been verified
   end-to-end through the UI. Likely just works, but worth a manual
   pass on a smartphone and a laptop before linking it from the textbook.
3. **Frontend round-ended shape.** The DP engine emits
   `round-ended` with `{ results: [...] }` (a flat array), while every
   other engine emits `{ results: { playerResults, summary } }`.
   Standardising this would let the practice-test harness drop the
   shape-detection branch and would make analytics code simpler.
4. **Larger arena option.** v1 ships a single compact arena. A bigger
   arena (closer to the classroom default) plus more bots would let
   advanced students explore more of the Hayekian spatial-discovery
   dynamic. Could be exposed as a "difficulty" toggle on the practice
   landing card.

## v2 build checklist

The hardest part — wiring the existing engine, bot strategy, and frontend
into the practice flow — is done. v2 is the bot-quality upgrade:

1. **Decide on the live-state interface.** The current
   `BotStrategy.getSpecializedActions(player, config)` signature returns
   pre-computed actions with delays, with no access to the live arena.
   Either (a) extend it to accept a `getRoundState()` callback, or (b)
   add a parallel `BotStrategy.tick(player, state)` method that
   `BotService` calls every N ticks. (b) is cleaner; (a) is less
   disruptive to the other strategies that already use the interface.
2. **Implement the three archetypes** in
   `botStrategies/SpecializedBotStrategies.ts`. Each one walks toward
   the nearest target of its preferred prey type, then fires
   `capture_prey` when within `captureRadius`. The trade-phase logic
   is archetype-specific (loner skips, coordinator deposits, mixed
   chooses by health).
3. **Round-robin assignment.** In `BotService.createBotsForSession`,
   when `gameType === 'discovery_process'`, assign archetypes by
   bot index `(0 → loner, 1 → coordinator, 2 → mixed)`. Persist the
   archetype on the bot record (or on a per-session bot-config map).
4. **Re-run the integration test.** Same command, expect non-floor
   profits on at least one bot per session.
5. **Companion-lab paragraph.** Already added in v1 with a
   provisional framing; revisit when v2 ships to lean harder on the
   three-archetype-pedagogy angle.

## Risk register

- **Real-time arena ≠ turn-based.** All eight current practice games are
  turn-based or have a per-round timer that hands the human a single
  decision. Discovery Process expects continuous click-to-move
  interaction. A student who tab-aways may return to a dead avatar.
  Mitigation: add an "auto-pilot" toggle the human can flip at any time
  to delegate to one of the archetype strategies.
- **Pixi.js rendering on small screens.** The default arena is 10 080 px
  wide; even at 40 % scale the practice viewport will need a mini-map
  fallback if the student is on a phone. Verify on iPhone-class viewport
  before shipping.
- **Bot fairness.** If the three archetypes consistently outperform the
  human, students will perceive the game as unwinnable. Calibrate so a
  median student finishes mid-pack across the three rounds.

## Companion-lab paragraph (draft, for Chapter 6)

*Hold for use after the build is complete. Cited papers should be added
to references.bib if not already present.*

> *Discovery Process (Hunter-Gatherer)* — four players (you plus three
> bots) navigate a small 2-D world divided into a large-prey side, a
> trading middle, and a small-prey side. Across three rounds you choose
> what to hunt, when to trade, and whom to coordinate with; health
> decays each round, so accumulated food carries over only partially.
> Large prey deliver $\(38\)$ food units but carry only a $\(25\%\)$
> capture probability per attempt; small prey pay $\(1\)$ unit
> reliably. The pedagogical setup is Hayek's
> \citet{hayek1945useknowledge}: no player sees the whole map, and the
> price of large-prey-equivalents in the middle-zone barter must
> emerge from decentralized voluntary deposits and pickups.
> The three bots run distinct archetypes — a *loner* who always works
> the small-prey side and never trades, a *coordinator* who commits
> to large prey and deposits into shared pots, and a *mixed* type who
> switches strategies when health is low — so a student can see all
> three patterns in one ten-minute session. Pairs naturally with the
> chapter's discussion of make-vs-buy and team production
> \citep{coase1937nature, alchian1972production}.

## Owner / next-action

This is a discrete piece of work suited to a single focused sprint
(estimate: one or two days for a developer who already knows the
codebase). Trigger: when the eight current practice games are stable
in production for at least two weeks of student use without bug
reports, work this spec.
