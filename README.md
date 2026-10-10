# Iron Vow — On the Piste

An independent browser fencing prototype inspired by épée. Two fencers, a straight piste, a point, and a first-to-five bout. [Play the live build](https://snowu.github.io/iron-vow/).

Advance and retreat to control distance. A quick thrust scores close up; a committed lunge adds reach through actual movement. Timed matching parries create riposte openings. Disengage to change blade line, feint early preparation, or beat the blade before attacking. Holding guard does not automatically block. Retreat has no invulnerability: it works only if the point falls short.

Touch detection sweeps the weapon point against a simplified whole-body target, using the same coordinates as the renderer. The simulation runs at 120 Hz. A 45 ms double-touch window allows both fencers to score, then play halts for 0.7 seconds and resets to en garde. First to five with a lead wins; a double at 4–4 continues at 5–5. This is an inspired game, not an official rules simulator: no refereeing, penalties, right-of-way, match clock, or detailed limb hitboxes yet.

## Controls

| Input           | Action                                         |
| --------------- | ---------------------------------------------- |
| D / right arrow | Advance                                        |
| A / left arrow  | Retreat                                        |
| Click / J       | Quick thrust                                   |
| Right click / K | Lunge                                          |
| Shift           | Timed parry matching the visible incoming line |
| Space           | Fast retreat                                   |
| E               | Disengage before commitment                    |
| F               | Feint during early preparation                 |
| G               | Beat the blade                                 |
| 1 / 2 / 3       | High / inside / outside blade line             |
| Escape          | Pause                                          |

## JEV

Play against JEV or watch both fencers use JEV. The three profiles are the tactician, presser, and counterfencer. The existing API's typed choice keys remain compatible; fencing-specific questions describe thrusts, lunges, blade beats, half-steps, parries, ripostes, and double-touch risk. A delayed controller executes these intentions within the deterministic combat rules. It commits to an observed attack line and can therefore be fooled by a disengage. JEV Details shows actual model, latency, decisions, and intention.

Both brains have independent request state and generation checks. Spectator requests share a 900 ms refresh budget and commit only complete pairs of replies; a faster API response cannot give one color extra policy updates. Both controllers observe the same pre-command simulation snapshot. The default spectator matchup is tactician versus tactician; profiles remain selectable. Spectator mode waits when either fresh JEV decision is unavailable; it never replaces either fencer with local AI. Human mode explicitly labels a local sparring fallback while retrying. Keep Fencing restarts completed spectator bouts automatically.

Each fencer retains a short history of observed attack lines, parries, retreats, and feints across exchanges. JEV receives those observations alongside recent outcomes, score, exact distance, and commitment timing. The controller samples proactive preparations from JEV's returned probabilities, punishes missed attacks using its cached opening choice, and can disengage a compound followup around a drawn parry. These are bounded observations and executable intentions, not a separately trained opponent model.

The frontend deploys through GitHub Pages. The existing Cloudflare Worker at `iron-vow-jev.zancato-t.workers.dev` calls JEV without exposing the provider key. Existing CORS, request limits, validation, timeouts, and rate limits remain active. The optional `discipline: fencing` selects fencing questions; older melee clients still get their original questions.

## Development

```sh
npm ci
npm run build
npm start
# http://localhost:4318
npm test
npm run test:browser                       # deterministic input fixture, complete bout
node tests/fencing-browser.mjs --live --ai # real JEV, both fencers, complete bout
node analysis/fencing-audit.mjs           # four real JEV bouts, mirrored and swapped profiles
npm run deploy:api
```

Node loads the existing `/home/snow/.config/typesafe/env` with `--env-file`; no key goes into browser assets or source. Set `VITE_API_BASE_URL` for the deployed frontend. The browser checks require system Chromium. Screenshots and results go into ignored `artifacts/`.

`src/fencing.js` is the active rules/geometry module; `src/fencing-ai.js` is the fencing controller and API state adapter. `src/main.js` renders the piste, solves arm joints, and handles UI/input. Older melee modules and tests remain as historical code; old browser scripts and balance reports do not validate this fencing game. `npm run test:browser` points to the active fencing check.

The current focus is spacing, readable point motion, and the attack–parry–riposte loop. Animation, foot placement, blade contact, collision detail, and balancing still need player feedback and refinement.

## Current combat and visual pass

Thrusts take 280 ms including recovery; lunges take 440 ms. Footwork remains available through preparation and recovery, and defense can cancel early anticipation or late recovery. Feint with F, choose another line, and buffer the next thrust while recovering. Disengages trace a short curved path; parries stay committed to their original line. Blade beats require crossing blade segments and briefly displace the opponent's weapon, permitting a follow-up thrust. Scored points stop at the target surface and resting points lift clear of nearby bodies.

The default rendering uses a PS1-inspired low-resolution buffer and faceted materials, with a clean rendering toggle. Weapon points have a small team-colored glow and a fading trail lasting 170 ms. The arena is an indoor fencing salle with a raised piste, wooden flooring, windows, and benches. Procedural fencers have rounded jackets, mask hoods, tapered limbs, gloves, and shoes; this is not a finished retro art direction.
