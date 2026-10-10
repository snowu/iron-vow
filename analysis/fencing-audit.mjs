// Read-only observation of real JEV bouts; no fixture policies or gameplay commands.
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
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors = [],
    results = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const matchups = [
    ["warden", "warden"],
    ["warden", "warden"],
    ["raider", "warden"],
    ["warden", "raider"],
  ];
  for (const [blue, red] of matchups) {
    await page.goto(process.env.GAME_URL || "http://localhost:4318");
    await page.click('[data-mode="ai"]');
    await page.selectOption("#player-persona", blue);
    await page.click(`[data-persona="${red}"]`);
    await page.uncheck("#auto-rounds");
    await page.click("#start");
    await page.evaluate(() => {
      const counts = [{}, {}],
        seen = [null, null],
        events = new Set();
      const audit = (window.__FENCING_AUDIT__ = {
        counts,
        events: {},
        lineChanges: [0, 0],
        reversals: [0, 0],
      });
      const lastLine = [null, null],
        lastMove = [0, 0];
      function observe() {
        const s = window.__IRON_VOW__.getState();
        for (const [i, f] of [s.player, s.enemy].entries()) {
          const key = `${s.exchange}:${f.serial}:${f.action}`;
          if (seen[i] !== key) {
            seen[i] = key;
            if (f.action !== "ready")
              counts[i][f.action] = (counts[i][f.action] || 0) + 1;
          }
          if (
            lastLine[i] &&
            lastLine[i] !== f.attackLine &&
            ["thrust", "lunge"].includes(f.action)
          )
            audit.lineChanges[i]++;
          lastLine[i] = f.attackLine;
          const movement = Math.sign(f.x - (audit[`x${i}`] ?? f.x));
          if (movement && lastMove[i] && movement !== lastMove[i])
            audit.reversals[i]++;
          if (movement) lastMove[i] = movement;
          audit[`x${i}`] = f.x;
        }
        for (const e of s.events) {
          const key = `${e.time}:${e.side}:${e.type}`;
          if (!events.has(key)) {
            events.add(key);
            audit.events[e.type] = (audit.events[e.type] || 0) + 1;
            if (e.type === "parry" && e.technique === "counter-parry")
              audit.events.counterParry = (audit.events.counterParry || 0) + 1;
            if (e.type === "touch" && e.technique === "riposte")
              audit.events.riposteTouch = (audit.events.riposteTouch || 0) + 1;
          }
        }
        if (s.mode === "play") requestAnimationFrame(observe);
      }
      observe();
    });
    const progress = setInterval(async () => {
      const s = await page
        .evaluate(() => window.__IRON_VOW__.getState())
        .catch(() => null);
      if (s)
        console.log(
          JSON.stringify({
            progress: true,
            blue,
            red,
            score: s.score,
            phase: s.phase,
            actions: [s.player.action, s.enemy.action],
            decisions: [s.brains.player.liveCount, s.brains.enemy.liveCount],
            failures: [s.brains.player.failures, s.brains.enemy.failures],
          }),
        );
    }, 15000);
    try {
      await page.waitForFunction(
        () => window.__IRON_VOW__.getState().mode === "result",
        null,
        { timeout: 180000 },
      );
    } finally {
      clearInterval(progress);
    }
    const result = await page.evaluate(() => {
      const s = window.__IRON_VOW__.getState();
      return {
        ...window.__FENCING_AUDIT__,
        score: s.score,
        decisions: [s.brains.player.liveCount, s.brains.enemy.liveCount],
        models: [
          s.brains.player.decision?.model,
          s.brains.enemy.decision?.model,
        ],
      };
    });
    delete result.x0;
    delete result.x1;
    results.push({ blue, red, ...result });
    console.log(JSON.stringify(results.at(-1)));
  }
  await fs.mkdir("artifacts", { recursive: true });
  await fs.writeFile(
    "artifacts/fencing-audit.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  if (errors.length) throw Error(errors.join("\n"));
} finally {
  await browser.close();
}
