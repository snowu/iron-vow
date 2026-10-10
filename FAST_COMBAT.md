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
