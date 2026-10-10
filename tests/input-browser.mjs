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
const policy = {
  tactic: "defend",
  movement: "hold",
  guard_direction: "top",
  attack_direction: "top",
  on_light: "block",
  on_heavy: "block",
  on_guardbreak: "counter",
  on_opening: "light",
  after_feint: "light",
  source: "deterministic-input-fixture",
  model: "test",
  latency: 0,
  probabilities: { tactic: { defend: 1 } },
};
await page.route("**/api/decision", (r) =>
  r.fulfill({ contentType: "application/json", body: JSON.stringify(policy) }),
);
await page.goto("http://localhost:4318");
await page.click("#start");
await page.waitForFunction(() => window.__IRON_VOW__.getState().liveCount > 0);
const early = await page.evaluate(() => {
  const key = (k) =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true }),
    );
  key("j");
  const first = window.__IRON_VOW__.getState();
  key("ArrowLeft");
  key("k");
  const queued = window.__IRON_VOW__.getState();
  key("w");
  return { first: first.player, queued: queued.player };
});
if (early.first.action !== "light" || early.queued.buffer?.type !== "heavy")
  throw Error("Immediate attack or early click buffering failed");
await page.waitForFunction(
  () => window.__IRON_VOW__.getState().player.attackSerial >= 2,
);
const chained = await page.evaluate(() => window.__IRON_VOW__.getState());
if (chained.player.x === early.first.x && chained.player.z === early.first.z)
  throw Error("Movement locked during attacks");
await page.keyboard.up("w");
await page.waitForFunction(
  () => window.__IRON_VOW__.getState().player.action === "idle",
);
// Click through the enemy brain panel: it must reach the canvas, not disappear in the HUD.
await page.mouse.click(950, 620);
const overlay = await page.evaluate(() => window.__IRON_VOW__.getState());
if (overlay.player.attackSerial <= chained.player.attackSerial)
  throw Error("Overlay swallowed attack click");
await page.waitForFunction(
  () => window.__IRON_VOW__.getState().player.action === "idle",
);
await page.mouse.move(500, 450);
await page.mouse.move(450, 450);
const guard = await page.evaluate(() => window.__IRON_VOW__.getState());
if (guard.player.guard !== "left")
  throw Error("Mouse directional guard failed");
const defense = await page.evaluate(() => {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", bubbles: true }),
  );
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }),
  );
  return window.__IRON_VOW__.getState().player.buffer;
});
if (defense?.type !== "dodge")
  throw Error("Defensive input discarded during swing");
await page.waitForFunction(
  () => window.__IRON_VOW__.getState().player.action === "dodge",
);
await page.screenshot({ path: "artifacts/fast-combat.png" });
const result = {
  fixture: true,
  immediateAttack: true,
  earlyFollowupQueued: true,
  movementDuringAttack: true,
  overlayClickAccepted: true,
  mouseGuard: true,
  defensiveBuffer: true,
  errors,
  fps: guard.fps,
};
await fs.writeFile(
  "artifacts/fast-input.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
