# Iron Vow — The Ashen Ring

An independent browser 3D sword-fighting POC inspired by directional melee duels. Procedural armored fighters, a torchlit stone arena, three enemy personalities, best-of-three matches, stamina, blocking, parries, heavy feints, guard breaks, and dodges.

## Play

```sh
cd /home/snow/Projects/iron-vow
npm install
npm run play
```

Open http://localhost:4318 and select **Enter the Ring**. Node loads the existing `/home/snow/.config/typesafe/env` through `--env-file`. The key is never read by the frontend or included in assets. Requires Node 22+.

Controls: WASD moves relative to your locked opponent. Arrow left/up/right (or Q/E/R) selects guard and attack direction. J / left click performs a light attack; K / right click a heavy. Space dodges in your movement direction (invulnerability only in the middle of the dodge), G breaks guard or counters a timed incoming grab, F cancels heavy windup before commitment, Shift commits to a parry with startup and punishable recovery. Inputs during windup and recovery buffer into four-hit chains. Mouse movement also selects guard. Guard switching takes 25 ms. Escape pauses. Match the red incoming direction to block. Use the Controls button for the complete guide.

## Combat and AI

Official contract: https://docs.typesafe.ai/introduction/quickstart . `POST https://api.typesafe.ai/v1/systemone` with `model: jev-latest`, semantic state, and nine independent Choice questions: tactic, attack direction, guard direction, movement, cached reactions to incoming light attacks, heavies, and guard breaks, plus opening punishes and post-feint mixups. The server samples returned probability distributions into legal commands. Health, stamina, distance, telegraphed attacks, arena boundaries, and recent player behavior inform the request. The browser asks about every 650 ms during active combat, with one request in flight. Cached contingency distributions are sampled once per observed attack and executed after personality-specific 105–145 ms reaction delays. The AI cannot read a new attack direction instantly. Feints can bait a committed parry or dodge. The deterministic combat layer runs at a fixed 120 Hz and enforces range, cooldown, stamina, and hit timing.

The JEV panel shows actual live distributions and latency. Connection loss is explicitly labelled LOCAL / OFFLINE and enables local sparring while retrying. The built game is served by a Node server bound to loopback; Vite is used only by the separate development command. Requests have size limits and upstream timeouts. The key stays in Node's environment.

```sh
npm run probe  # actual live directional decision, no key output
npm test       # combat, AI, facing, and movement rules
npm run build  # bundle frontend
npm start      # serve built game plus live JEV
npm run dev    # development server
npm run balance # sampled live JEV distributions across 480 simulated duels
```

QUALITY AUTO disables shadows and reduces render resolution when frame rate drops; HIGH increases visual quality.

No other agent's game implementation is used or modified. No models, textures, or external art downloads are required. Fonts have system fallbacks.

## Fast combat revision

Light attacks start immediately and hit after 200 ms; heavies hit after 380 ms. Movement stays active during attacks and recovery. Click during windup to queue one follow-up, with up to four chained strikes. Dodges and parries can cancel recovery after 50 ms. Move the mouse left, up, or right to switch guard; arrow keys remain available. Overlay panels do not intercept combat clicks. The enemy has slightly longer telegraphs than the player, while its tactics, movement, directions, and reactions still come from JEV. Shadows are off by default and internal render resolution is capped to keep input responsive.

Earlier balance/verification results describe the previous slow combat build and should not be used as evidence of this revision's feel.

## GitHub Pages

Pushes to main run tests, build, and publish through `.github/workflows/pages.yml`. Vite uses the Pages project path for assets. Pages serves static files: the published demo explicitly uses local AI until an HTTPS JEV backend is configured. No API key belongs in frontend build variables.

To connect a separately hosted backend, set repository Actions variable `JEV_API_BASE_URL` to its HTTPS origin and rerun the workflow. The backend must allow CORS from the Pages origin. The existing localhost server remains the live-JEV development setup.

## Combat readability revision

The camera now views the duel from the side, keeping both fighters and their swords visible. Enemy guard and incoming attack arrows appear above the enemy; a green arrow means your guard matches. Yellow OPEN indicates a punish window. Player guard buttons sit in the lower left. Sword trails show the cut path, and contact flows into the same recovery pose instead of snapping to a different pose. Blocked lights support followups, movement keeps full speed during swings, and attack inputs survive parry stagger. Mouse guard requires a deliberate 28-pixel motion. Pages local AI holds each decision for 350 ms rather than changing direction each simulation tick. Live JEV remains a separate backend requirement.
