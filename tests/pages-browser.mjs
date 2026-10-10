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
    viewport: { width: 1024, height: 768 },
  });
  const errors = [],
    apiRequests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/api/")) apiRequests.push(r.url());
  });
  const response = await page.goto(
    process.env.GAME_URL || "https://snowu.github.io/iron-vow/",
  );
  assert.equal(response.status(), 200);
  await page.waitForFunction(
    () => window.__IRON_VOW__?.getState().renderedFrames > 5,
  );
  await page.click("#start");
  await page.keyboard.press("j");
  await page.waitForFunction(
    () => window.__IRON_VOW__.getState().player.attackSerial >= 1,
  );
  await page.waitForTimeout(3500);
  const state = await page.evaluate(() => window.__IRON_VOW__.getState());
  const badge = await page.locator("#connection").textContent();
  assert.match(badge, /LOCAL AI/);
  assert.equal(state.liveCount, 0);
  assert.ok(state.enemy.attackSerial > 0, "Local enemy must fight");
  assert.deepEqual(errors, []);
  assert.deepEqual(
    apiRequests,
    [],
    "Static demo must not poll nonexistent API",
  );
  console.log(
    JSON.stringify(
      {
        url: page.url(),
        playerAttack: true,
        enemyAttack: true,
        badge,
        apiRequests,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
