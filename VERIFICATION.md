> Historical baseline only. Superseded by the fast combat revision after user playtesting rejected its feel. These results do not establish the current combat quality.

# Prototype verification — 2026-10-10

Current playable build: http://localhost:4318. Independent project directory: `/home/snow/Projects/iron-vow`.

## Requirement audit

| Requirement | Evidence |
| --- | --- |
| Playable 3D directional sword duel | Actual Chromium rendering and keyboard gameplay; `artifacts/intro.png`, `artifacts/combat.png`, `artifacts/round-1.png`, `artifacts/round-2.png` |
| Learn and integrate real JEV | Official TypeSafe quickstart contract; successful live probe; final API responses from `jev-1.13.0` in browser checks |
| JEV chooses enemy tactics and directions | Nine typed Choice judgments; actual live probabilities consumed by the controller for tactics, sword direction, guard, movement, reactions, opening punishes, and post-feint mixups |
| Tight core mechanics | 23 deterministic assertions across combat, AI, world physics, and facing tests; fixed 120 Hz simulation shared by browser and balance harness |
| Offense/defense counterplay | Matching guard, guard-switch vulnerability, committed parries, punishable dodge recovery, guardbreak counters, buffered chains, feint commitment, stamina and range enforcement |
| AI with fair reaction time | Delayed cached contingency reactions; tests ensure it cannot read a telegraph instantly, preserves defense through impact, and capitalizes on openings |
| Full match lifecycle | Live browser full-match runs verified scoring, best-of-three completion, and restart; `artifacts/browser-smart.json` |
| Three personalities | All three selected and verified against live JEV in the built game; `artifacts/browser-systems.json` |
| Facing correction | All eight arena headings tested; actual visor-to-helmet forward vectors point at opponents (dot product approximately 1) for all three browser selections |
| Clean runtime | Build passes; browser error lists empty; source is formatted; server files return 404 from static serving |
| API recovery | Browser forced a 503, checked explicit LOCAL status, then restored requests and verified live JEV resumed |
| Credential privacy | Node loads the provided env file; frontend receives decisions only; credential contents were never inspected or printed |
| Independent work | All game implementation lives in this separate directory; other agent's game implementation was not used or edited |

## Balance evidence and limits

`npm run balance` evaluates 480 deterministic duels using cached real JEV distributions for five situations per personality and the exact shared simulation. It is a regression/exploit check, not a substitute for human playtesting or an estimate of human win rate. In the final run, repeated unfeinted heavies lost 40/40 against Warden and Raider, and 39/40 against Duelist. A defensive counterplay policy won 29/40, 36/40, and 29/40 respectively. The live browser defensive bot also won full matches using actual keyboard inputs; it recorded 16 successful parries and six blocks in the last full built-game match.

The POC uses procedural fighters and arena geometry, locked-on duels, and a local single-player Node server. It does not claim finished production graphics, multiplayer, or production hosting. Human feedback can drive further tuning; the supplied visual-facing report was corrected and verified.

Run `npm run play` to rebuild and launch, `npm test` for rules, and `npm run probe` for a live judgment. Browser verification uses system Chromium through `node tests/browser.mjs`, with `--match --smart` for a full defensive match and `--systems` for persona/outage checks.
