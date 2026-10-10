# Historical combat pass

This document records the previous revision, rejected for clunky combat. Its completion claims do not establish the quality of the current fast revision. See FAST_COMBAT.md for current checks.

# Combat pass

User priority: tight core gameplay and AI; visual polish can wait.

The first playable build and live JEV integration are verified. This pass addresses observed mechanical weaknesses before calling the prototype complete:

- Replace dropped recovery inputs with a short action buffer and deliberate two-hit chains.
- Split dodge invulnerability from dodge recovery; early/late dodges should be punishable.
- Make parries committed timed actions rather than freely spammed guard bonuses.
- Add guard-break counterplay and a follow-up opening.
- Add guard-switch travel time, hitstop, distinct strike/recovery timing, and light/heavy pressure tradeoffs.
- Run combat on a fixed timestep independent of render speed.
- Cache JEV contingency judgments and execute reactions after human reaction delays, instead of waiting for a fresh network request or reading player inputs instantaneously.
- Verify mechanics with deterministic simulation, policy matches, and actual browser input through complete rounds.

Completion requires clean browser gameplay, verified live JEV control of decisions/directions, full match/restart flow, and meaningful defense/offense counterplay. A screenshot and one successful strike alone are insufficient.

## Verified result

All planned mechanics are implemented. The built game is running at http://localhost:4318. The final browser systems check verified all three live-JEV personalities, visual facing from actual helmet geometry, outage recovery, and static serving without server source exposure. Full matches verified both defeat from repeated heavy attacks and victory through timed defensive counterplay, plus best-of-three scoring and restart.

See VERIFICATION.md and the local artifacts directory for evidence.
