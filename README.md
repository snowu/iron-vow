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

Pushes to main run tests, build, and publish through `.github/workflows/pages.yml`. Vite uses the Pages project path for assets. Pages serves static files and calls the Cloudflare Worker at `https://iron-vow-jev.zancato-t.workers.dev` for live JEV decisions. The repository variable `JEV_API_BASE_URL` selects this endpoint. The API key is a Cloudflare secret and is never in frontend build variables.

To connect a separately hosted backend, set repository Actions variable `JEV_API_BASE_URL` to its HTTPS origin and rerun the workflow. The deployed Worker allows CORS from `https://snowu.github.io`. The existing localhost server remains the live-JEV development setup.

## Combat readability revision

The camera now views the duel from the side, keeping both fighters and their swords visible. Enemy guard and incoming attack arrows appear above the enemy; a green arrow means your guard matches. Yellow OPEN indicates a punish window. Player guard buttons sit in the lower left. Sword trails show the cut path, and contact flows into the same recovery pose instead of snapping to a different pose. Blocked lights support followups, movement keeps full speed during swings, and attack inputs survive parry stagger. Mouse guard requires a deliberate 28-pixel motion. Pages local AI holds each decision for 350 ms rather than changing direction each simulation tick. Live JEV now runs through the Cloudflare backend.

## Cloudflare JEV backend

`worker/index.js` uses the same nine-question JEV contract as the local Node server. `wrangler.jsonc` targets Worker `iron-vow-jev` in the existing Cloudflare account. It validates combat state, limits JSON bodies to 8 KiB, supplies server-owned personalities, applies per-IP (240/minute) and service (900/minute) rate limit bindings, and enables logs and sampled traces. Cloudflare rate limit counters are per location, approximate safeguards rather than a billing cap. Errors retain CORS headers so the game can show LOCAL fallback and retry. Requests to JEV time out after six seconds; the browser times out after nine.

```sh
npm run deploy:api  # deploy backend changes; existing secret is preserved
npm run secret:api  # transfer existing env-loaded key directly to Worker secret stdin
npm run dev:api     # local Worker runtime; local secrets require an ignored .dev.vars file
API_URL=https://iron-vow-jev.zancato-t.workers.dev node tests/browser.mjs --systems --url=https://snowu.github.io/iron-vow/
```

Frontend pushes to main automatically redeploy GitHub Pages. Backend changes currently deploy through `npm run deploy:api`; they are not automatically deployed by the Pages workflow. Browser origins restrict browser access but are not user authentication. The backend never accepts a client-supplied upstream URL, model, API key, or question set.

## JEV vs JEV spectator mode

Select **JEV vs JEV**, choose the blue fighter personality, choose the red opponent, and click **Watch Duel**. Both fighters request independent live JEV decisions using their own health, stamina, guard, personality, and opponent observations. Their cached contingencies and delayed reactions use the same combat rules. Both AI fighters use the same personality-dependent attack timing. The blue and red panels show their separate model, latency, probabilities, and live decision counts.

Escape pauses. Combat inputs are disabled while spectating. **Keep Dueling** advances rounds and starts a new best-of-three after a 2.5-second result display; disable it to advance manually. If either live decision cache expires, the fighters wait for JEV to reconnect. Spectator mode never substitutes local AI. Decision updates are staggered at roughly 1.1 seconds per fighter.

```sh
GAME_URL=https://snowu.github.io/iron-vow/ node tests/ai-browser.mjs
```
