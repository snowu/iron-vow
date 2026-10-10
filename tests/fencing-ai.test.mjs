import { test } from "node:test";
import assert from "node:assert/strict";
import { bout, step, command } from "../src/fencing.js";
import {
  fencingController,
  stepFencingAI,
  stepFencingPair,
} from "../src/fencing-ai.js";
import { createBrain, decisionDue, requestDecisionPair } from "../src/brain.js";
test("fencer reacts after perception delay and remains committed to the observed line", () => {
  const s = bout(),
    [a, b] = s.fencers;
  cSetup(s);
  const c = fencingController("warden");
  const policy = { tactic: "defend", movement: "hold", on_light: "parry" };
  command(a, "thrust");
  stepFencingAI(c, b, a, policy, 0.01);
  assert.equal(b.action, "ready");
  a.attackLine = "high";
  stepFencingAI(c, b, a, policy, 0.08);
  assert.equal(b.action, "parry");
  assert.equal(b.line, "inside");
});
test("both AI fighters perceive the same pre-command instant", () => {
  const s = bout();
  cSetup(s);
  const cs = [fencingController("warden"), fencingController("warden")];
  cs.forEach((c) => {
    c.cooldown = 0;
  });
  const policy = {
    tactic: "heavy",
    movement: "advance",
    attack_direction: "left",
    on_heavy: "parry",
  };
  stepFencingPair(cs, s.fencers, [policy, policy], 1 / 120);
  assert.deepEqual(
    s.fencers.map((f) => f.action),
    ["lunge", "lunge"],
  );
  assert.deepEqual(
    cs.map((c) => c.response),
    [null, null],
  );
  step(s, 1 / 120);
  stepFencingPair(cs, s.fencers, [policy, policy], 1 / 120);
  assert.equal(cs[0].response.at, cs[1].response.at);
});
test("decision refresh has equal budgets and independent failure backoff", () => {
  const brains = [createBrain(), createBrain()];
  brains.forEach((b) => {
    b.lastBrain = 1;
  });
  for (const now of [1.5, 1.91, 2.5])
    assert.equal(decisionDue(brains[0], now), decisionDue(brains[1], now));
  brains[0].pending = true;
  assert.equal(decisionDue(brains[0], 2), false);
  assert.equal(decisionDue(brains[1], 2), true);
  brains[0].pending = false;
  brains[0].failures = 1;
  assert.equal(decisionDue(brains[0], 2), false);
  assert.equal(decisionDue(brains[0], 4.01), true);
});
test("paired JEV refresh waits for both replies before either policy changes", async () => {
  const brains = [createBrain(), createBrain()];
  let release;
  const slow = new Promise((resolve) => {
    release = resolve;
  });
  const result = requestDecisionPair(
    brains,
    [{ persona: "fast" }, { persona: "slow" }],
    {
      now: () => 2,
      fetchImpl: async (_, options) => {
        const persona = JSON.parse(options.body).persona;
        if (persona === "slow") await slow;
        return new Response(JSON.stringify({ source: "jev", tactic: persona }));
      },
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(brains.every((b) => b.pending));
  assert.ok(brains.every((b) => b.decision === null));
  release();
  assert.equal(await result, "live");
  assert.deepEqual(
    brains.map((b) => b.liveCount),
    [1, 1],
  );
  assert.deepEqual(
    brains.map((b) => b.decisionAt),
    [2, 2],
  );
});
test("failed or stale paired refresh cannot replace just one fighter's policy", async () => {
  for (const stale of [false, true]) {
    const brains = [createBrain(), createBrain()];
    brains.forEach((b) => {
      b.decision = { source: "jev", tactic: "old" };
    });
    const result = await requestDecisionPair(
      brains,
      [{ persona: "fast" }, { persona: "broken" }],
      {
        isCurrent: () => !stale,
        fetchImpl: async (_, options) =>
          JSON.parse(options.body).persona === "broken"
            ? new Response("", { status: 503 })
            : new Response(JSON.stringify({ source: "jev", tactic: "new" })),
      },
    );
    assert.equal(result, stale ? "stale" : "failed");
    assert.ok(brains.every((b) => b.decision.tactic === "old" && !b.pending));
  }
});
test("observed preparations and feints survive exchange resets", () => {
  const s = bout();
  const c = fencingController("warden");
  const policy = { tactic: "defend", movement: "hold", on_heavy: "accept" };
  const [self, foe] = s.fencers;
  foe.line = "outside";
  command(foe, "lunge");
  stepFencingAI(c, self, foe, policy, 1 / 120);
  foe.action = "recover";
  foe.feinted = true;
  stepFencingAI(c, self, foe, policy, 1 / 120);
  const next = fencingController("warden", c.history);
  assert.ok(next.history.some((h) => h.includes("lunge in outside")));
  assert.ok(next.history.some((h) => h.includes("feint")));
});
test("a missed lunge is punished from JEV's cached opening choice", () => {
  const s = bout();
  cSetup(s);
  s.fencers[1].action = "lunge";
  s.fencers[1].elapsed = 0.29;
  const c = fencingController("warden");
  c.seen = s.fencers[1].serial;
  c.cooldown = 1;
  stepFencingAI(
    c,
    s.fencers[0],
    s.fencers[1],
    {
      tactic: "defend",
      movement: "hold",
      on_opening: "heavy",
      attack_direction: "right",
    },
    1 / 120,
  );
  assert.equal(s.fencers[0].action, "lunge");
  assert.equal(s.fencers[0].attackLine, "outside");
});
test("compound followup disengages around a drawn matching parry", () => {
  const s = bout();
  cSetup(s);
  const c = fencingController("warden");
  c.compound = true;
  command(s.fencers[0], "lunge");
  s.fencers[0].elapsed = 0.055;
  command(s.fencers[1], "parry");
  stepFencingAI(
    c,
    s.fencers[0],
    s.fencers[1],
    { attack_direction: "right" },
    1 / 120,
  );
  assert.equal(s.fencers[0].attackLine, "outside");
  assert.ok(s.fencers[0].disengageAt >= 0);
});
test("cached attack intention does not override JEV's distance invitation", () => {
  for (const movement of ["retreat", "hold"]) {
    const s = bout();
    const c = fencingController("warden");
    c.engaged = true;
    c.cooldown = 0;
    const footwork = stepFencingAI(
      c,
      s.fencers[0],
      s.fencers[1],
      { tactic: "light", movement, attack_direction: "left" },
      1 / 120,
    );
    assert.equal(s.fencers[0].action, "ready");
    assert.ok(movement === "retreat" ? footwork < 0 : footwork === 0);
  }
});
test("opening retreat policies establish measure instead of walking to the back lines", () => {
  const s = bout();
  const cs = [fencingController("warden"), fencingController("warden")];
  const policy = { tactic: "dodge", movement: "retreat" };
  for (let tick = 0; tick < 120 && !cs.some((c) => c.engaged); tick++) {
    const previousGap = s.fencers[1].x - s.fencers[0].x;
    const moves = stepFencingPair(cs, s.fencers, [policy, policy], 1 / 120);
    if (cs.some((c) => c.engaged)) break;
    assert.ok(moves.every((move) => move >= 0));
    assert.ok(s.fencers.every((f) => f.action === "ready"));
    step(s, 1 / 120, moves);
    assert.ok(s.fencers[1].x - s.fencers[0].x <= previousGap);
  }
  assert.ok(s.fencers.every((f) => f.action === "ready"));
  assert.ok(s.fencers[1].x - s.fencers[0].x <= 2.23);
});
test("opening measure does not suppress defense against an actual commitment", () => {
  const s = bout();
  const c = fencingController("warden");
  command(s.fencers[1], "lunge");
  const policy = { tactic: "defend", movement: "retreat", on_heavy: "dodge" };
  stepFencingAI(c, s.fencers[0], s.fencers[1], policy, 0.01);
  stepFencingAI(c, s.fencers[0], s.fencers[1], policy, 0.08);
  assert.equal(c.engaged, true);
  assert.equal(s.fencers[0].action, "retreat");
});
test("a spent fencer can give ground without completing opening measure", () => {
  const s = bout();
  s.fencers[0].stamina = 15;
  const c = fencingController("warden");
  const move = stepFencingAI(
    c,
    s.fencers[0],
    s.fencers[1],
    { movement: "retreat" },
    1 / 120,
  );
  assert.ok(move < 0);
});
test("a missed blade beat is not treated as a successful opening", () => {
  const s = bout();
  command(s.fencers[0], "beat");
  s.fencers[0].elapsed = 0.12;
  s.fencers[0].connected = true;
  const c = fencingController("warden");
  stepFencingAI(
    c,
    s.fencers[0],
    s.fencers[1],
    { tactic: "guardbreak", movement: "hold" },
    1 / 120,
  );
  assert.equal(s.fencers[0].action, "beat");
  assert.equal(s.fencers[0].queue, null);
});
test("two passive JEV policies take model-selected initiative within bounded time", () => {
  for (const initiative of ["light", "heavy"]) {
    const s = bout();
    const cs = [
      fencingController("warden", [], seeded(1)),
      fencingController("warden", [], seeded(2)),
    ];
    const policy = {
      tactic: "defend",
      movement: "hold",
      initiative,
      attack_direction: "right",
      on_light: "accept",
      on_heavy: "accept",
    };
    let committed = false;
    for (let tick = 0; tick < 120 * 4; tick++) {
      step(
        s,
        1 / 120,
        stepFencingPair(cs, s.fencers, [policy, policy], 1 / 120),
      );
      if (
        s.fencers.some(
          (f) =>
            f.action === (initiative === "heavy" ? "lunge" : "thrust") &&
            f.elapsed >= 0.08,
        )
      ) {
        committed = true;
        break;
      }
    }
    assert.ok(committed, initiative);
    assert.ok(
      cs.some((c) => c.history.some((h) => h.includes("took initiative"))),
    );
  }
});
test("repeated feints do not indefinitely postpone a committed initiative attack", () => {
  const s = bout();
  cSetup(s);
  const c = fencingController("warden", [], seeded(5));
  const policy = {
    tactic: "feint",
    movement: "hold",
    after_feint: "defend",
    initiative: "heavy",
    attack_direction: "left",
  };
  let committed = false;
  for (let tick = 0; tick < 120 * 4; tick++) {
    step(s, 1 / 120, [
      stepFencingAI(c, s.fencers[0], s.fencers[1], policy, 1 / 120),
      0,
    ]);
    if (s.fencers[0].action === "lunge" && s.fencers[0].elapsed >= 0.08) {
      committed = true;
      break;
    }
  }
  assert.ok(committed);
  assert.ok(c.history.some((h) => h.includes("took initiative")));
});
test("initiative still reacts to an opponent who commits first", () => {
  const s = bout();
  cSetup(s);
  const c = fencingController("warden");
  c.initiative = "heavy";
  command(s.fencers[1], "lunge");
  s.fencers[1].elapsed = 0.09;
  const policy = {
    tactic: "defend",
    movement: "hold",
    initiative: "heavy",
    on_heavy: "dodge",
  };
  stepFencingAI(c, s.fencers[0], s.fencers[1], policy, 0.01);
  stepFencingAI(c, s.fencers[0], s.fencers[1], policy, 0.08);
  assert.equal(c.initiative, null);
  assert.equal(s.fencers[0].action, "retreat");
});
function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
test("JEV anticipates a riposte using its guessed guard rather than an unseen attack line", () => {
  const s = bout();
  cSetup(s);
  const [a, b] = s.fencers;
  a.displacement = "parry";
  a.bladeLost = 0.18;
  b.riposte = 0.4;
  b.line = "inside";
  const c = fencingController("warden");
  stepFencingAI(
    c,
    a,
    b,
    {
      tactic: "defend",
      movement: "hold",
      on_light: "parry",
      guard_direction: "right",
    },
    1 / 120,
  );
  assert.equal(a.defenseQueue.line, "outside");
  assert.equal(b.action, "ready");
});
test("JEV chooses the riposte line independently of its successful parry", () => {
  const s = bout();
  cSetup(s);
  const a = s.fencers[0];
  a.parries = 1;
  a.riposte = 0.4;
  a.line = "inside";
  const c = fencingController("warden");
  stepFencingAI(
    c,
    a,
    s.fencers[1],
    { on_opening: "light", attack_direction: "right" },
    1 / 120,
  );
  assert.equal(a.action, "thrust");
  assert.equal(a.attackLine, "outside");
  assert.equal(a.technique, "riposte");
});
test("swapping colors preserves seeded tactical bouts", () => {
  const policy = {
    initiative: "heavy",
    movement: "advance",
    on_light: "parry",
    on_heavy: "dodge",
    on_guardbreak: "counter",
    on_opening: "light",
    after_feint: "light",
    probabilities: {
      tactic: {
        light: 0.25,
        heavy: 0.25,
        guardbreak: 0.2,
        feint: 0.2,
        defend: 0.1,
      },
      attack_direction: { left: 0.4, top: 0.2, right: 0.4 },
    },
  };
  const normalized = (s, mirror) => ({
    phase: s.phase,
    score: mirror ? [...s.score].reverse() : s.score,
    fencers: (mirror ? [...s.fencers].reverse() : s.fencers).map((f) => ({
      x: Math.round(f.x * (mirror ? -1 : 1) * 1e6),
      action: f.action,
      line: f.attackLine,
      stamina: Math.round(f.stamina * 1e6),
      lost: Math.round(f.bladeLost * 1e6),
      parries: f.parries,
    })),
  });
  for (let seed = 1; seed <= 16; seed++) {
    const a = bout(),
      b = bout();
    let ca = [
      fencingController("warden", [], seeded(seed)),
      fencingController("raider", [], seeded(seed + 70)),
    ];
    let cb = [
      fencingController("raider", [], seeded(seed + 70)),
      fencingController("warden", [], seeded(seed)),
    ];
    for (let tick = 0; tick < 120 * 30 && a.phase !== "finished"; tick++) {
      const exchange = a.exchange;
      step(
        a,
        1 / 120,
        stepFencingPair(ca, a.fencers, [policy, policy], 1 / 120),
      );
      step(
        b,
        1 / 120,
        stepFencingPair(cb, b.fencers, [policy, policy], 1 / 120),
      );
      assert.deepEqual(
        normalized(a, false),
        normalized(b, true),
        `seed ${seed}, tick ${tick}`,
      );
      if (a.exchange !== exchange) {
        ca = ca.map((c) => fencingController(c.persona, c.history, c.random));
        cb = cb.map((c) => fencingController(c.persona, c.history, c.random));
      }
    }
  }
});
function cSetup(s) {
  s.fencers[0].x = -1.2;
  s.fencers[1].x = 1.2;
}
test("JEV feint intention flows into a different-line thrust instead of endlessly feinting", () => {
  const s = bout();
  cSetup(s);
  const c = fencingController("duelist");
  c.cooldown = 0;
  const policy = {
    tactic: "feint",
    movement: "advance",
    attack_direction: "left",
    after_feint: "light",
  };
  for (let i = 0; i < 60; i++) {
    const move = stepFencingAI(c, s.fencers[0], s.fencers[1], policy, 1 / 120);
    step(s, 1 / 120, [move, 0]);
    if (s.fencers[0].serial >= 2) break;
  }
  assert.ok(s.fencers[0].serial >= 2);
  assert.equal(s.fencers[0].action, "thrust");
  assert.equal(c.feintedLine, "inside");
  assert.notEqual(s.fencers[0].attackLine, c.feintedLine);
});
