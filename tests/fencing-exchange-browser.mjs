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
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/decision", (r) => {
    requests.push(r.request().postDataJSON());
    return r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        source: "jev",
        model: "riposte-fixture",
        latency: 0,
        tactic: "defend",
        movement: "hold",
        attack_direction: "left",
        guard_direction: "left",
        on_light: "parry",
        on_heavy: "parry",
        on_opening: "light",
      }),
    });
  });
  await page.goto(process.env.GAME_URL || "http://localhost:4318");
  await page.click("#start");
  await page.keyboard.down("d");
  await page.waitForFunction(() => {
    const s = window.__IRON_VOW__.getState();
    return s.enemy.x - s.player.x < 2.15;
  });
  await page.keyboard.up("d");
  await page.keyboard.press("j");
  await page.waitForFunction(
    () => window.__IRON_VOW__.getState().enemy.parries > 0,
  );
  await page.keyboard.press("Shift");
  await page.waitForFunction(() =>
    window.__IRON_VOW__
      .getState()
      .events.some(
        (e) =>
          e.side === 0 && e.type === "parry" && e.technique === "counter-parry",
      ),
  );
  await page.keyboard.press("3");
  await page.keyboard.press("k");
  await page.waitForFunction(() => window.__IRON_VOW__.getState().score[0] > 0);
  const s = await page.evaluate(() => window.__IRON_VOW__.getState());
  assert.ok(
    s.events.some(
      (e) => e.side === 0 && e.type === "touch" && e.technique === "riposte",
    ),
  );
  assert.equal(s.player.attackLine, "outside");
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.abs(s.expectedTips[i].x - s.rig[i].tip[0]) < 1e-6);
    assert.ok(Math.abs(s.expectedTips[i].y - s.rig[i].tip[1]) < 1e-6);
  }
  await page.waitForFunction(() => window.__IRON_VOW__.getState().exchange > 1);
  await page.waitForTimeout(1200);
  const latest = requests.at(-1);
  assert.ok(
    latest.habits.some(
      (h) => h.includes("opponent: riposte outside") && h.includes("scored"),
    ),
  );
  assert.ok(latest.habits.some((h) => h.includes("successful parry")));
  assert.ok(
    latest.habits.length <= 6 && latest.habits.every((h) => h.length <= 160),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      fixture: true,
      counterParry: true,
      changedLineRiposte: true,
      score: s.score,
      renderedPointsMatch: true,
      confirmedOutcomesReachNextExchange: true,
      errors,
    }),
  );
} finally {
  await browser.close();
}
