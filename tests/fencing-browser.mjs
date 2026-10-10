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
const live = process.argv.includes("--live"),
  ai = process.argv.includes("--ai"),
  errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  if (!live)
    await page.route("**/api/decision", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          tactic: "defend",
          movement: "hold",
          attack_direction: "left",
          guard_direction: "left",
          on_light: "accept",
          on_heavy: "accept",
          probabilities: { tactic: { defend: 1 } },
          latency: 0,
          source: "jev",
          model: "input-fixture",
        }),
      }),
    );
  await page.goto(process.env.GAME_URL || "http://localhost:4318");
  await fs.mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/fencing-intro.png" });
  if (ai) {
    await page.click('[data-mode="ai"]');
    await page.uncheck("#auto-rounds");
  }
  await page.click("#start");
  await page.waitForFunction(
    () => window.__IRON_VOW__.getState().brains.enemy.liveCount > 0,
    null,
    { timeout: 30000 },
  );
  if (ai) {
    await page.waitForFunction(
      () => window.__IRON_VOW__.getState().brains.player.liveCount > 0,
      null,
      { timeout: 30000 },
    );
    const before = await page.evaluate(
      () => window.__IRON_VOW__.getState().player.serial,
    );
    await page.keyboard.press("j");
    assert.equal(
      (await page.evaluate(() => window.__IRON_VOW__.getState())).player.serial,
      before,
    );
  } else {
    await page.keyboard.down("d");
    await page.waitForFunction(() => {
      const s = window.__IRON_VOW__.getState();
      return Math.abs(s.player.x - s.enemy.x) < 1.95;
    });
    await page.keyboard.up("d");
    await page.keyboard.press("j");
    const immediate = await page.evaluate(() => window.__IRON_VOW__.getState());
    assert.equal(immediate.player.action, "thrust");
    await page.waitForFunction(
      () => window.__IRON_VOW__.getState().score[0] > 0,
    );
    await page.waitForFunction(
      () => window.__IRON_VOW__.getState().phase === "halt",
    );
    const halt = await page.evaluate(() => window.__IRON_VOW__.getState());
    assert.equal(halt.score[0], 1);
    await page.keyboard.press("k");
    assert.equal(
      (await page.evaluate(() => window.__IRON_VOW__.getState())).player.serial,
      halt.player.serial,
    );
    await page.waitForFunction(
      () => window.__IRON_VOW__.getState().phase === "fence",
    );
    await page.keyboard.press("k");
    const lunge = await page.evaluate(() => window.__IRON_VOW__.getState());
    assert.equal(lunge.player.action, "lunge");
    await page.keyboard.press("f");
    assert.equal(
      (await page.evaluate(() => window.__IRON_VOW__.getState())).player.action,
      "recover",
    );
  }
  await page.keyboard.press("Escape");
  assert.equal(
    (await page.evaluate(() => window.__IRON_VOW__.getState())).paused,
    true,
  );
  const frozen = await page.evaluate(
    () => window.__IRON_VOW__.getState().player.x,
  );
  await page.keyboard.press("d");
  await page.waitForTimeout(200);
  assert.equal(
    (await page.evaluate(() => window.__IRON_VOW__.getState())).player.x,
    frozen,
  );
  await page.keyboard.press("Escape");
  if (live && ai) {
    await page.keyboard.press("Escape");
    await page.route("**/api/decision", (r) =>
      r.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "https://snowu.github.io" },
        body: JSON.stringify({ error: "Simulated outage" }),
      }),
    );
    await page.waitForTimeout(6500);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => {
      const s = window.__IRON_VOW__.getState();
      return s.brains.player.failures > 0 && s.brains.enemy.failures > 0;
    });
    const waiting = await page.evaluate(() => window.__IRON_VOW__.getState());
    await page.waitForTimeout(500);
    const held = await page.evaluate(() => window.__IRON_VOW__.getState());
    assert.deepEqual(
      [held.player.x, held.enemy.x, held.player.serial, held.enemy.serial],
      [
        waiting.player.x,
        waiting.enemy.x,
        waiting.player.serial,
        waiting.enemy.serial,
      ],
    );
    assert.match(await page.locator("#connection").textContent(), /WAITING/);
    await page.unroute("**/api/decision");
    await page.waitForFunction(
      () => {
        const s = window.__IRON_VOW__.getState();
        return s.brains.player.failures === 0 && s.brains.enemy.failures === 0;
      },
      null,
      { timeout: 30000 },
    );
  }
  if (!ai)
    await page.evaluate(() => {
      const down = (key) =>
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true }),
          ),
        up = (key) =>
          window.dispatchEvent(
            new KeyboardEvent("keyup", { key, bubbles: true }),
          );
      function play() {
        const s = window.__IRON_VOW__.getState();
        if (s.mode !== "play") {
          up("d");
          return;
        }
        if (s.phase === "fence") {
          if (s.enemy.x - s.player.x > 1.9) down("d");
          else {
            up("d");
            if (s.player.action === "ready") {
              down("j");
              up("j");
            }
          }
        } else up("d");
        requestAnimationFrame(play);
      }
      play();
    });
  await page.waitForTimeout(1400);
  await page.screenshot({
    path: ai
      ? "artifacts/fencing-jev-vs-jev.png"
      : "artifacts/fencing-play.png",
  });
  await page.waitForFunction(
    () => window.__IRON_VOW__.getState().mode === "result",
    null,
    { timeout: 240000 },
  );
  const state = await page.evaluate(() => window.__IRON_VOW__.getState());
  assert.ok(state.score.some((n) => n >= 5));
  assert.notEqual(state.score[0], state.score[1]);
  assert.ok(state.exchange >= 5);
  if (live) {
    assert.ok(state.brains.enemy.liveCount > 1);
    assert.ok(state.brains.enemy.decision.model.startsWith("jev-"));
    if (ai) {
      assert.ok(state.brains.player.liveCount > 1);
      assert.ok(state.brains.player.decision.model.startsWith("jev-"));
      assert.equal(state.brains.player.liveCount, state.brains.enemy.liveCount);
      for (const brain of [state.brains.player, state.brains.enemy])
        assert.ok(["light", "heavy"].includes(brain.decision.initiative));
    }
  }
  await page.screenshot({ path: "artifacts/fencing-result.png" });
  await page.click("#next");
  assert.deepEqual(
    (await page.evaluate(() => window.__IRON_VOW__.getState())).score,
    [0, 0],
  );
  assert.deepEqual(errors, []);
  const result = {
    live,
    ai,
    score: state.score,
    exchanges: state.exchange,
    blueDecisions: state.brains.player.liveCount,
    redDecisions: state.brains.enemy.liveCount,
    model: state.brains.enemy.decision.model,
    initiatives: ai
      ? [
          state.brains.player.decision?.initiative,
          state.brains.enemy.decision?.initiative,
        ]
      : undefined,
    restart: true,
    pause: true,
    errors,
  };
  await fs.writeFile(
    "artifacts/fencing-browser.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
