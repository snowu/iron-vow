# Fast combat revision — 2026-10-10

This revision addresses the user's report of clunky combat. Previous completion claims in COMBAT_PLAN.md and VERIFICATION.md describe the rejected revision.

Player light startup is 200 ms; heavy startup is 380 ms. Guard switching takes 25 ms. Movement continues through swings. A single early followup buffers through startup; four-hit chains can begin after 55 ms recovery. Dodge/parry inputs buffer instead of disappearing during committed attacks. Defense cancels recovery after 50 ms, and queued attacks leave dodge recovery after its 190 ms evasion window. Heavy feints recover in 65 ms. Enemy telegraphs are longer than player startup, with personality-specific reaction delays and live JEV choices. A side camera exposes the opponent at close range. Rendering uses unshadowed Lambert materials and automatic resolution adjustment.

## Verification

- 23 unit tests passed: timing budgets, directional chains, defense buffering/cancels, active versus vulnerable parry/dodge windows, feints, guardbreak counters, stamina/range, AI reaction delay and cached choices, movement/collision, and visual facing.
- Production build succeeded.
- Playwright actual-input fixture passed immediate attack, early queued followup, movement during attack, HUD click-through, mouse guard, and defensive buffering. The fixture explicitly replaces JEV only for deterministic input checks. See artifacts/fast-input.json and fast-combat.png.
- Separate live-JEV systems check passed warden, raider, and duelist using jev-1.13.0, facing alignment, outage recovery, and production serving without exposed server source. No browser exceptions.
- Live-JEV full best-of-three keyboard match finished two rounds with player health 61 each, enemy health 0, 42 live decisions, seven parries in each round, and verified restart. No browser exceptions. See artifacts/browser-smart.json.

Automated checks verify behavior and runtime reliability; they do not establish subjective combat feel. Software-rendered Chromium remains slower than a hardware-rendered browser. This is a combat prototype and needs player feedback on this revision.

## Readability and transitions followup

The user rejected the first fast revision as unclear and clanky. This followup changes camera composition to a side view, places directional telegraphs and enemy guard/opening indicators above the enemy, moves player guard controls off the fighters, and adds a short sword trail. A shared pose function connects contact and recovery without resetting the arm, and transitions into chained strikes blend over the first 45 ms. Full movement speed continues through attacks. Blocked lights now accept chained followups; attack queues persist through a full parry stagger. Local Pages AI holds decisions for 350 ms instead of resampling every 120 Hz step. Mouse guard requires 28 pixels of deliberate movement. Static armor parts are batched per animated bone to reduce draw calls.

Validation: 29 unit tests passed, including pose continuity in all three directions, blocked followups, and buffering through parry stagger. Actual browser input checks passed. A full live-JEV best-of-three match finished and restarted without browser errors (59 live decisions, eight parries each round). Three-personality live checks, facing, and outage recovery also passed. These checks do not establish subjective feel; the revision still needs player feedback. Pages continues to use explicitly labelled local AI until a remote JEV backend is connected.

## Cloudflare backend and JEV spectator mode

The public Pages game now calls `iron-vow-jev.zancato-t.workers.dev`. The API key is stored as a Worker secret, transferred through Node env loading and Wrangler stdin without displaying the key or reading the env file into the conversation. Worker request validation, body limits, origin handling, inference timeout, and rate-limit paths have seven focused tests; local Workers runtime checks and actual remote JEV inference also passed. A hosted three-personality check verified live JEV, facing, and outage recovery.

JEV vs JEV uses separate blue/red request state, caches, controllers, and personality selections. Both see their own fighter as self and the other as opponent. Five new tests verify role reversal, concurrent brain isolation, stale response rejection after reset, fresh JEV-only decisions, and independent failure state. All 41 unit tests passed. Human browser input checks remain passing.

The hosted spectator check completed a full best-of-three with `jev-1.13.0` on both sides, independent live decisions, pause, automatic rounds, automatic next-match restart, and forced outage recovery. With both caches expired, neither side began new attacks, confirming there was no local substitute. No browser exceptions. See artifacts/ai-browser.json and jev-vs-jev.png. Local dual-brain API scheduling was also checked with two actual JEV responses.
