# Practice mode for Discovery Process — follow-up spec

**Status:** deferred. Practice mode currently ships eight games (one per chapter
except Chapter 6); this spec is the explicit follow-up to fill that gap.

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

## What's missing

1. **Practice config.** No entry in `backend/src/services/practiceConfigs.ts`.
2. **Human role.** The engine uses role `'gatherer'`; the
   `PRACTICE_HUMAN_ROLES` map currently has `discovery_process: 'producer'`
   inherited from an older config — needs to be changed to `'gatherer'` to
   match the engine's UI config.
3. **Frontend solo-mode path.** Currently a student lands on `/practice` and
   clicks a game card → `POST /api/practice/<gameType>/start` → frontend
   navigates to `/session/:code/market`. Verify Market.tsx renders
   DiscoveryProcessUI cleanly with the human as the only seat-1 gatherer
   and bots filling the rest.
4. **Bot strategy quality.** The current bot logic is a random walk:
   50/50 left vs right, random capture attempts. For pedagogy we want at
   least three behavioral archetypes:
   - *Loner*: always small-prey side, never trades (free-riding baseline).
   - *Coordinator*: large-prey side, deposits into shared pots, picks up
     others' deposits in the trade phase.
   - *Mixed*: hunts large prey when health is high, falls back to small
     prey when health is low (rational risk-averse).
   Mixing one of each in a 4-player session would let the student see all
   three patterns in a single run.
5. **Practice-tuned config.** The defaults are calibrated for a full
   classroom session (30 s hunting + 60 s trading × multiple rounds).
   For solo + bots we want shorter rounds and a smaller world so the
   student doesn't spend 90 s walking. Suggested practice defaults:
   - `market_size: 4` (1 human + 3 bots, one per archetype)
   - `num_rounds: 3` (enough for health-decay dynamics to matter)
   - `time_per_round: 120` (covers 30 s hunting + 60 s trading + 5 s
     interim plus headroom)
   - `worldWidth: 4200`, `worldHeight: 700` (≈ 40 % of default — keeps
     visual density up with fewer agents)
   - `largePrey: 8`, `smallPrey: 16` (scaled to map and player count)

## Build checklist

When the time comes, the implementation order is:

1. **Add the practice config** — `practiceConfigs.ts`:
   ```ts
   discovery_process: {
     market_size: 4,
     num_rounds: 3,
     time_per_round: 120,
     game_config: {
       worldWidth: 4200,
       worldHeight: 700,
       leftZoneEnd: 1400,
       middleZoneEnd: 2800,
       largePrey: 8,
       smallPrey: 16,
       huntingDuration: 30,
       tradingDuration: 60,
       interimDuration: 5,
       enableHit: false,
       enableTugOfWar: true,
     },
     ...NON_DA_DEFAULTS,
   },
   ```
2. **Fix the human role** — change `discovery_process: 'producer'` to
   `discovery_process: 'gatherer'` in `PRACTICE_HUMAN_ROLES`.
3. **Add three archetype bot strategies** — split
   `discoveryProcessStrategy.getSpecializedActions` into `loner`,
   `coordinator`, `mixed` variants and have BotService dispatch round-robin
   on bot index, so a 3-bot session contains one of each.
4. **Tune bot timing.** Cap action sequences to fit within the
   `time_per_round` budget, and ensure bots don't all click the same
   prey ID (the existing code uses random `prey_${1 + Math.floor(...)}`
   which can collide).
5. **End-to-end test.** Add an entry to `test-practice.js`:
   ```js
   if (gameType === 'discovery_process') return { type: 'set_target', x: 2100, y: 350 };
   ```
   then run `node test-practice.js discovery_process 5` and verify all
   five rounds complete with `round-ended` payloads that include the
   human player.
6. **Companion-lab pointer in Chapter 6.** Once tests pass, add a
   `\section*{Companion lab}` block at the end of `Chapter6_Organizational_Design.tex`
   (and mirror to the Overleaf project) framed around free-riding and
   discovery — Ostrom's *Governing the Commons* is the natural citation
   alongside Hayek's *Use of Knowledge in Society*.

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
