import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(
  (process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
    process.env.GAME_URL ||
    "http://localhost:4318") + "/?quality=low",
);
await page.waitForFunction(
  () => window.__IRON_VOW__?.getState().renderedFrames > 5,
);
await fs.mkdir("artifacts", { recursive: true });
await page.screenshot({ path: "artifacts/intro.png" });
if (process.argv.includes("--systems")) {
  const checks = [];
  for (const persona of ["warden", "raider", "duelist"]) {
    await page.reload();
    await page.click(`[data-persona="${persona}"]`);
    await page.click("#start");
    await page.waitForFunction(
      () => window.__IRON_VOW__.getState().liveCount > 0,
    );
    const state = await page.evaluate(() => window.__IRON_VOW__.getState());
    if (state.facing.player.dot < 0.98 || state.facing.enemy.dot < 0.98)
      throw Error("Facing regression");
    if (!state.decision.on_opening || !state.decision.after_feint)
      throw Error("Final JEV followups missing");
    checks.push({
      persona,
      live: state.liveCount,
      model: state.decision.model,
      facing: state.facing,
    });
  }
  const before = await page.evaluate(
    () => window.__IRON_VOW__.getState().liveCount,
  );
  await page.route("**/api/decision", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Simulated outage" }),
    }),
  );
  await page.waitForFunction(() => window.__IRON_VOW__.getState().failures > 0);
  if ((await page.locator("#brain-status").textContent()) !== "LOCAL")
    throw Error("Offline state is not labelled");
  await page.unroute("**/api/decision");
  await page.waitForFunction(
    (count) => {
      const s = window.__IRON_VOW__.getState();
      return s.liveCount > count && s.failures === 0;
    },
    before,
    { timeout: 30000 },
  );
  const health = await page.request.get(
    new URL("/api/health", page.url()).toString(),
  );
  const info = await health.json();
  if (!info.production) throw Error("Expected built game");
  const traversal = await page.request.get(
    new URL("/server.mjs", page.url()).toString(),
  );
  if (traversal.status() !== 404) throw Error("Server source exposed");
  await fs.writeFile(
    "artifacts/browser-systems.json",
    JSON.stringify(
      {
        checks,
        outageRecovery: true,
        production: info.production,
        sourceNotServed: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { checks, outageRecovery: true, production: true, errors },
      null,
      2,
    ),
  );
  await browser.close();
  if (errors.length) process.exitCode = 1;
  process.exit();
}
await page.click("#start");
if (process.argv.includes("--match")) {
  const smart = process.argv.includes("--smart");
  const rounds = [];
  for (let roundIndex = 0; roundIndex < 3; roundIndex++) {
    const outcome = await page.evaluate(
      (smart) =>
        new Promise((done, reject) => {
          const started = performance.now();
          let last = 0;
          const press = (key, code = "") => {
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key, code, bubbles: true }),
            );
            window.dispatchEvent(
              new KeyboardEvent("keyup", { key, code, bubbles: true }),
            );
          };
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "w", bubbles: true }),
          );
          function play() {
            const s = window.__IRON_VOW__.getState();
            if (s.mode === "result") {
              window.dispatchEvent(
                new KeyboardEvent("keyup", { key: "w", bubbles: true }),
              );
              done(s);
              return;
            }
            if (performance.now() - started > 180000) {
              reject(Error("Round did not end"));
              return;
            }
            if (s.enemy.action === "heavy" || s.enemy.action === "light") {
              press(
                s.enemy.attackDir === "top"
                  ? "ArrowUp"
                  : s.enemy.attackDir === "left"
                    ? "ArrowLeft"
                    : "ArrowRight",
              );
            }
            if (
              smart &&
              s.player.action === "idle" &&
              s.player.stun === 0 &&
              (s.enemy.action === "heavy" || s.enemy.action === "light") &&
              s.enemy.timer < 0.11 &&
              s.enemy.timer > 0.025 &&
              s.player.parryCooldown === 0
            )
              press("Shift");
            if (smart && s.enemy.action === "guardbreak") press("g");
            if (
              smart &&
              s.player.action === "heavy" &&
              s.player.elapsed > 0.12 &&
              s.player.elapsed < 0.22 &&
              s.enemy.action === "idle" &&
              s.enemy.stamina > 25
            )
              press("f");
            if (
              s.player.action === "idle" &&
              s.player.stun === 0 &&
              performance.now() - last > 100 &&
              (!smart ||
                s.enemy.action === "idle" ||
                s.enemy.action === "recover" ||
                s.enemy.action === "parry")
            ) {
              const dir = s.enemy.guard === "left" ? "ArrowRight" : "ArrowLeft";
              press(dir);
              press(
                smart
                  ? s.enemy.action === "parry"
                    ? "g"
                    : s.enemy.stun > 0.2 || s.enemy.action === "recover"
                      ? "j"
                      : "k"
                  : s.player.stamina > 30
                    ? "k"
                    : "j",
              );
              last = performance.now();
            }
            requestAnimationFrame(play);
          }
          requestAnimationFrame(play);
        }),
      smart,
    );
    rounds.push({
      round: outcome.round,
      pWins: outcome.pWins,
      eWins: outcome.eWins,
      playerHealth: outcome.player.hp,
      enemyHealth: outcome.enemy.hp,
      liveCount: outcome.liveCount,
      parries: outcome.player.parries,
      blocks: outcome.player.blocks,
    });
    await page.screenshot({ path: `artifacts/round-${roundIndex + 1}.png` });
    if (outcome.pWins === 2 || outcome.eWins === 2) break;
    await page.click("#next");
  }
  const final = await page.evaluate(() => window.__IRON_VOW__.getState());
  if (final.pWins !== 2 && final.eWins !== 2)
    throw Error("Best of three did not finish");
  await page.click("#next");
  const restarted = await page.evaluate(() => window.__IRON_VOW__.getState());
  if (restarted.round !== 1 || restarted.pWins !== 0 || restarted.eWins !== 0)
    throw Error("Restart failed");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await fs.writeFile(
    smart ? "artifacts/browser-smart.json" : "artifacts/browser-match.json",
    JSON.stringify({ rounds, restartVerified: true, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ rounds, restartVerified: true, errors }, null, 2),
  );
  await browser.close();
  if (errors.length) process.exitCode = 1;
  process.exit();
}
await page.waitForFunction(
  () => window.__IRON_VOW__.getState().liveCount >= 2,
  { timeout: 15000 },
);
await page.keyboard.press("ArrowLeft");
await page.keyboard.down("w");
await page.waitForTimeout(350);
await page.keyboard.up("w");
await page.keyboard.press("j");
await page.waitForTimeout(700);
await page.keyboard.press("ArrowRight");
await page.keyboard.press("k");
await page.waitForTimeout(220);
await page.keyboard.press("f");
await page.waitForTimeout(300);
await page.keyboard.press("Space");
await page.waitForTimeout(500);
await page.screenshot({ path: "artifacts/combat.png" });
const facing = await page.evaluate(() => window.__IRON_VOW__.getState().facing);
if (facing.player.dot < 0.98 || facing.enemy.dot < 0.98)
  throw Error("Visual fighters face away from their opponent");
const state = await page.evaluate(() => window.__IRON_VOW__.getState());
await page.keyboard.press("Escape");
const before = await page.evaluate(() => window.__IRON_VOW__.getState());
await page.waitForTimeout(500);
const after = await page.evaluate(() => window.__IRON_VOW__.getState());
if (before.player.hp !== after.player.hp || before.enemy.hp !== after.enemy.hp)
  throw Error("Paused combat changed health");
await page.keyboard.press("Escape");
await page.click("#help");
await page.screenshot({ path: "artifacts/controls.png" });
await page.click("#close-help");
console.log(JSON.stringify({ errors, state, pauseVerified: true }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
