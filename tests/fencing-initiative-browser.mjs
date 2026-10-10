import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
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
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const initiative of ["light", "heavy"]) {
    await page.route("**/api/decision", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          source: "jev",
          model: "mutual-bait-fixture",
          latency: 0,
          tactic: "defend",
          movement: "hold",
          initiative,
          attack_direction: "left",
          guard_direction: "left",
          on_light: "accept",
          on_heavy: "accept",
        }),
      }),
    );
    await page.goto(process.env.GAME_URL || "http://localhost:4318");
    await page.click('[data-mode="ai"]');
    await page.uncheck("#auto-rounds");
    await page.click("#start");
    await page.waitForFunction(
      () => window.__IRON_VOW__.getState().brains.player.liveCount > 0,
    );
    const began = Date.now();
    await page.waitForFunction(
      () => {
        const s = window.__IRON_VOW__.getState();
        return s.score.some((n) => n > 0);
      },
      null,
      { timeout: 6000 },
    );
    const s = await page.evaluate(() => window.__IRON_VOW__.getState());
    assert.equal(s.brains.player.decision.initiative, initiative);
    assert.equal(s.brains.player.liveCount, s.brains.enemy.liveCount);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        fixture: true,
        initiative,
        firstTouchMs: Date.now() - began,
        score: s.score,
        errors,
      }),
    );
    await page.unroute("**/api/decision");
  }
} finally {
  await browser.close();
}
