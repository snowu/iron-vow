import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBrain,
  duelState,
  requestDecision,
  liveDecision,
} from "../src/brain.js";
import { fighter } from "../src/combat.js";
test("each JEV fighter sees itself and its opponent in the right roles", () => {
  const blue = fighter(0, 2),
    red = fighter(0, -1);
  blue.hp = 15;
  blue.guard = "left";
  red.hp = 95;
  red.guard = "right";
  red.action = "heavy";
  const b = duelState(blue, red, "raider"),
    r = duelState(red, blue, "warden");
  assert.equal(b.self.health, "low");
  assert.equal(b.opponent.health, "high");
  assert.equal(r.self.health, "high");
  assert.equal(r.opponent.guard, "left");
  assert.equal(b.persona, "raider");
  assert.equal(r.persona, "warden");
});
test("concurrent fighter requests do not share pending flags or decisions", async () => {
  const blue = createBrain(),
    red = createBrain();
  let resolveBlue, resolveRed;
  const b = requestDecision(
      blue,
      { persona: "raider" },
      {
        fetchImpl: () =>
          new Promise((r) => {
            resolveBlue = r;
          }),
      },
    ),
    r = requestDecision(
      red,
      { persona: "warden" },
      {
        fetchImpl: () =>
          new Promise((r) => {
            resolveRed = r;
          }),
      },
    );
  assert.equal(blue.pending, true);
  assert.equal(red.pending, true);
  resolveRed(Response.json({ source: "jev", tactic: "heavy" }));
  assert.equal(await r, "live");
  assert.equal(blue.pending, true);
  assert.equal(blue.decision, null);
  resolveBlue(Response.json({ source: "jev", tactic: "light" }));
  assert.equal(await b, "live");
  assert.equal(red.decision.tactic, "heavy");
  assert.equal(blue.decision.tactic, "light");
  assert.equal(blue.liveCount, 1);
  assert.equal(red.liveCount, 1);
});
test("a late response cannot affect a restarted round", async () => {
  const brain = createBrain();
  let done,
    current = true;
  const request = requestDecision(
    brain,
    {},
    {
      isCurrent: () => current,
      fetchImpl: () =>
        new Promise((r) => {
          done = r;
        }),
    },
  );
  current = false;
  done(Response.json({ source: "jev" }));
  assert.equal(await request, "stale");
  assert.equal(brain.decision, null);
  assert.equal(brain.liveCount, 0);
  assert.equal(brain.pending, false);
});
test("spectator mode only accepts a fresh live JEV decision", () => {
  const brain = createBrain();
  assert.equal(liveDecision(brain, 0), null);
  brain.decision = { source: "local" };
  assert.equal(liveDecision(brain, 0), null);
  brain.decision = { source: "jev" };
  brain.decisionAt = 2;
  assert.ok(liveDecision(brain, 6));
  assert.equal(liveDecision(brain, 7.1), null);
});
test("one failed brain does not mark the other fighter offline", async () => {
  const blue = createBrain(),
    red = createBrain();
  await requestDecision(
    blue,
    {},
    { fetchImpl: async () => Response.json({}, { status: 503 }) },
  );
  await requestDecision(
    red,
    {},
    { fetchImpl: async () => Response.json({ source: "jev" }) },
  );
  assert.equal(blue.failures, 1);
  assert.equal(red.failures, 0);
  assert.equal(red.liveCount, 1);
});
