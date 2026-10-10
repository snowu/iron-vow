import fs from "node:fs/promises";
import { ask, personas, decode } from "../brain.mjs";
import {
  fighter,
  requestAttack,
  switchGuard,
  counterBreak,
  parry,
  feint,
  specs,
} from "../src/combat.js";
import { controller, stepAI } from "../src/ai.js";
import { stepDuel } from "../src/world.js";
const scenarios = {
  parry_hunter: {
    distance: "within sword reach",
    self: { health: "moderate", stamina: "high", action: "idle" },
    opponent: { health: "high", stamina: "high", action: "idle", guard: "top" },
    habits: [
      "opponent parries almost every committed sword attack",
      "opponent waits for the parry opening then uses a light counter",
      "opponent attacks predictably after blocking, and has not countered a guardbreak",
    ],
  },
  neutral: {
    distance: "within sword reach",
    self: { health: "high", stamina: "high", action: "idle" },
    opponent: { health: "high", stamina: "high", action: "idle", guard: "top" },
    habits: [],
  },
  heavy_spam: {
    distance: "within sword reach",
    self: { health: "moderate", stamina: "high", action: "idle" },
    opponent: {
      health: "high",
      stamina: "moderate",
      action: "heavy",
      guard: "left",
      attackDirection: "left",
    },
    habits: [
      "opponent repeatedly uses unfeinted heavy attacks from the left",
      "opponent never parries",
    ],
  },
  feints: {
    distance: "within sword reach",
    self: { health: "moderate", stamina: "moderate", action: "idle" },
    opponent: {
      health: "moderate",
      stamina: "moderate",
      action: "idle",
      guard: "right",
    },
    habits: [
      "opponent often feints heavy attacks then guardbreaks",
      "opponent punishes whiffed parries",
    ],
  },
  exhausted: {
    distance: "within sword reach",
    self: { health: "low", stamina: "low", action: "idle" },
    opponent: {
      health: "moderate",
      stamina: "high",
      action: "idle",
      guard: "top",
    },
    habits: ["opponent waits for attacks to miss then counters"],
  },
};
await fs.mkdir("artifacts", { recursive: true });
let corpus;
try {
  corpus = JSON.parse(await fs.readFile("artifacts/jev-corpus.json", "utf8"));
} catch {
  corpus = {};
}
for (const persona of Object.keys(personas)) {
  corpus[persona] ??= {};
  for (const [name, state] of Object.entries(scenarios)) {
    if (corpus[persona][name]?.probabilities?.on_opening) continue;
    const result = await ask(
      { ...state, persona, personality: personas[persona] },
      process.env.TYPESAFE_API_KEY,
    );
    corpus[persona][name] = result;
    console.log(`Collected ${persona}/${name}: ${result.latency} ms`);
  }
}
await fs.writeFile(
  "artifacts/jev-corpus.json",
  JSON.stringify(corpus, null, 2),
);
function rng(seed) {
  let n = seed;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
function sampled(result, random) {
  const d = { ...result };
  for (const [key, p] of Object.entries(result.probabilities)) {
    let n = random();
    for (const [choice, value] of Object.entries(p)) {
      n -= value;
      if (n <= 0) {
        d[key] = choice;
        break;
      }
    }
  }
  return d;
}
const results = [];
for (const persona of Object.keys(personas))
  for (const policy of ["heavy_spam", "light_spam", "feint_mix", "reactive"]) {
    let wins = 0,
      losses = 0,
      draws = 0,
      totalTime = 0,
      counts = {
        hit: 0,
        block: 0,
        parry: 0,
        evade: 0,
        break: 0,
        counter: 0,
        miss: 0,
      };
    for (let seed = 1; seed <= 40; seed++) {
      const random = rng(seed),
        p = fighter(0, 2),
        e = fighter(0, -1),
        c = controller(persona, random);
      let decision = sampled(corpus[persona].neutral, random),
        next = 0,
        time = 0,
        feinted = false,
        phase = 0,
        observed = 0,
        response = null;
      while (time < 90 && p.hp > 0 && e.hp > 0) {
        const dt = 1 / 120;
        time += dt;
        if (time >= next) {
          const situation =
            e.stamina < 25
              ? "exhausted"
              : policy === "reactive"
                ? "parry_hunter"
                : policy === "heavy_spam"
                  ? "heavy_spam"
                  : policy === "feint_mix"
                    ? "feints"
                    : "neutral";
          decision = sampled(corpus[persona][situation], random);
          next = time + 1.1;
        }
        if (
          policy === "reactive" &&
          e.attackSerial !== observed &&
          specs[e.action]
        ) {
          observed = e.attackSerial;
          response = {
            at: time + Math.max(0.2, e.timer - 0.12),
            dir: e.attackDir,
            type: e.action,
          };
        }
        if (
          response &&
          time >= response.at &&
          p.action === "idle" &&
          p.stun === 0
        ) {
          switchGuard(p, response.dir);
          if (response.type === "guardbreak") counterBreak(p, e);
          else parry(p);
          response = null;
        }
        if (
          p.action === "heavy" &&
          policy === "feint_mix" &&
          p.elapsed > 0.28 &&
          !feinted &&
          phase % 3 === 0
        ) {
          feint(p);
          feinted = true;
        }
        if (p.action === "idle" && p.stun === 0 && !response) {
          switchGuard(
            p,
            policy === "heavy_spam"
              ? "left"
              : e.guard === "left"
                ? "right"
                : "left",
          );
          const type =
            policy === "light_spam"
              ? "light"
              : policy === "feint_mix" && feinted
                ? "guardbreak"
                : policy === "reactive" && e.stun > 0
                  ? "light"
                  : "heavy";
          if (requestAttack(p, type) === "started") {
            phase++;
            if (type === "guardbreak") feinted = false;
          }
        }
        const length = Math.hypot(e.x - p.x, e.z - p.z) || 1,
          move = { x: (e.x - p.x) / length, z: (e.z - p.z) / length };
        const events = stepDuel(p, e, dt, {
          move,
          enemyStep: (step) => stepAI(c, e, p, decision, step),
        });
        for (const event of events) counts[event.outcome]++;
      }
      totalTime += time;
      if (e.hp <= 0 && p.hp > 0) wins++;
      else if (p.hp <= 0) losses++;
      else draws++;
    }
    results.push({
      persona,
      policy,
      wins,
      losses,
      draws,
      meanSeconds: Math.round(totalTime / 40),
      events: counts,
    });
  }
await fs.writeFile(
  "artifacts/balance.json",
  JSON.stringify(
    {
      source:
        "Live JEV distributions; deterministic 120 Hz shared game simulation; 40 seeds per pairing",
      results,
    },
    null,
    2,
  ),
);
console.table(results.map(({ events, ...rest }) => rest));
