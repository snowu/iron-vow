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
  const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/decision", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        tactic: "defend",
        movement: "hold",
        attack_direction: "left",
        on_light: "accept",
        on_heavy: "accept",
        probabilities: { tactic: { defend: 1 } },
        source: "jev",
        model: "technique-fixture",
        latency: 0,
      }),
    }),
  );
  const state = () => page.evaluate(() => window.__IRON_VOW__.getState());
  const close = async () => {
    await page.click("#start");
    await page.keyboard.down("d");
    await page.waitForFunction(() => {
      const s = window.__IRON_VOW__.getState();
      return s.enemy.x - s.player.x < 2;
    });
    await page.keyboard.up("d");
  };
  await page.goto(process.env.GAME_URL || "http://localhost:4318");
  await close();
  await page.keyboard.press("g");
  await page.waitForFunction(() =>
    window.__IRON_VOW__.getState().events.some((e) => e.type === "beat"),
  );
  const beat = await state();
  assert.ok(beat.enemy.bladeLost > 0);
  assert.deepEqual(beat.score, [0, 0]);
  assert.ok(beat.events.find((e) => e.type === "beat").point);
  await page.screenshot({ path: "artifacts/fencing-blade-contact.png" });
  await page.click("#style");
  assert.equal((await state()).retro, false);
  await page.screenshot({ path: "artifacts/fencing-clean.png" });
  await page.reload();
  await close();
  await page.evaluate(() => {
    const press = (key) =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
    press("k");
    press("f");
    press("3");
    press("j");
  });
  const prep = await state();
  assert.equal(prep.player.action, "recover");
  assert.equal(prep.player.line, "outside");
  assert.equal(prep.player.queue, "thrust");
  await page.waitForFunction(() => window.__IRON_VOW__.getState().lights[0]);
  const touch = await state();
  assert.equal(touch.player.attackLine, "outside");
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.abs(touch.rig[i].tip[0] - touch.expectedTips[i].x) < 1e-6);
    assert.ok(Math.abs(touch.rig[i].tip[1] - touch.expectedTips[i].y) < 1e-6);
  }
  assert.ok(touch.expectedTips[0].x < touch.enemy.x - 0.24);
  await page.screenshot({ path: "artifacts/fencing-point-contact.png" });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        fixture: true,
        bladeContact: true,
        compoundAttack: true,
        surfaceContact: true,
        renderedPointMatchesCollision: true,
        styleToggle: true,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
