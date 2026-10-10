import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
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
try {
  const page = await browser.newPage({
      viewport: { width: 1024, height: 768 },
    }),
    errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().endsWith("/api/decision"))
      requests.push(r.postDataJSON().persona);
  });
  await page.goto(process.env.GAME_URL || "http://localhost:4318");
  await page.click('[data-mode="ai"]');
  await page.selectOption("#player-persona", "raider");
  const auto = process.argv.includes("--auto");
  if (!auto) await page.uncheck("#auto-rounds");
  await page.click('[data-persona="warden"]');
  await page.click("#start");
  await page.waitForFunction(
    () => {
      const s = window.__IRON_VOW__.getState();
      return s.brains.player.liveCount > 0 && s.brains.enemy.liveCount > 0;
    },
    null,
    { timeout: 45000 },
  );
  let state = await page.evaluate(() => window.__IRON_VOW__.getState());
  assert.equal(state.battleMode, "ai");
  assert.equal(state.brains.player.decision.source, "jev");
  assert.equal(state.brains.enemy.decision.source, "jev");
  assert.ok(requests.includes("raider") && requests.includes("warden"));
  assert.equal(await page.locator("#guard").isVisible(), false);
  assert.equal(await page.locator("#brain-player").isVisible(), true);
  await page.keyboard.press("Escape");
  state = await page.evaluate(() => window.__IRON_VOW__.getState());
  assert.equal(state.paused, true);
  const serial = state.player.attackSerial;
  await page.keyboard.press("j");
  await page.keyboard.press("k");
  await page.keyboard.press("Space");
  const frozen = await page.evaluate(() => window.__IRON_VOW__.getState());
  assert.equal(frozen.player.attackSerial, serial);
  await page.keyboard.press("Escape");
  // Expire both live caches while paused, then verify that no local substitute starts attacks.
  await page.keyboard.press("Escape");
  await page.route("**/api/decision", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "https://snowu.github.io" },
      body: JSON.stringify({ error: "Simulated outage" }),
    }),
  );
  await page.waitForTimeout(6500);
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => {
      const s = window.__IRON_VOW__.getState();
      return s.brains.player.failures > 0 && s.brains.enemy.failures > 0;
    },
    null,
    { timeout: 20000 },
  );
  const waiting = await page.evaluate(() => window.__IRON_VOW__.getState());
  await page.waitForTimeout(800);
  const held = await page.evaluate(() => window.__IRON_VOW__.getState());
  assert.equal(held.player.attackSerial, waiting.player.attackSerial);
  assert.equal(held.enemy.attackSerial, waiting.enemy.attackSerial);
  assert.match(await page.locator("#connection").textContent(), /WAITING/);
  await page.unroute("**/api/decision");
  await page.waitForFunction(
    () => {
      const s = window.__IRON_VOW__.getState();
      return s.brains.player.failures === 0 && s.brains.enemy.failures === 0;
    },
    null,
    { timeout: 20000 },
  );
  await page.waitForFunction(
    () => {
      const s = window.__IRON_VOW__.getState();
      return s.player.attackSerial > 0 && s.enemy.attackSerial > 0;
    },
    null,
    { timeout: 45000 },
  );
  await fs.mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/jev-vs-jev.png" });
  await page.waitForFunction(
    () => window.__IRON_VOW__.getState().mode === "result",
    null,
    { timeout: 240000 },
  );
  state = await page.evaluate(() => window.__IRON_VOW__.getState());
  assert.equal(state.pWins + state.eWins, 1);
  if (auto) {
    await page.waitForFunction(
      () => {
        const s = window.__IRON_VOW__.getState();
        return s.mode === "result" && (s.pWins === 2 || s.eWins === 2);
      },
      null,
      { timeout: 240000 },
    );
    state = await page.evaluate(() => window.__IRON_VOW__.getState());
  }
  assert.ok(state.player.hp === 0 || state.enemy.hp === 0);
  assert.ok(
    state.brains.player.liveCount > 1 && state.brains.enemy.liveCount > 1,
  );
  assert.ok(state.brains.player.decision.model.startsWith("jev-"));
  assert.ok(state.brains.enemy.decision.model.startsWith("jev-"));
  if (!auto) await page.click("#next");
  await page.waitForFunction(
    (auto) => {
      const s = window.__IRON_VOW__.getState();
      return (
        s.round === (auto ? 1 : 2) &&
        s.brains.player.liveCount > 0 &&
        s.brains.enemy.liveCount > 0
      );
    },
    auto,
    { timeout: 45000 },
  );
  assert.deepEqual(errors, []);
  const result = {
    mode: state.battleMode,
    playerPersona: state.playerPersona,
    enemyPersona: state.persona,
    blue: {
      live: state.brains.player.liveCount,
      model: state.brains.player.decision.model,
      hp: state.player.hp,
      attacks: state.player.attackSerial,
    },
    red: {
      live: state.brains.enemy.liveCount,
      model: state.brains.enemy.decision.model,
      hp: state.enemy.hp,
      attacks: state.enemy.attackSerial,
    },
    pWins: state.pWins,
    eWins: state.eWins,
    pause: true,
    restart: true,
    autoRounds: auto,
    fullMatch: auto,
    outageRecovery: true,
    noLocalSubstitution: true,
    errors,
  };
  await fs.writeFile(
    "artifacts/ai-browser.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
