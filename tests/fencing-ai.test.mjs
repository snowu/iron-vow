import { test } from "node:test";
import assert from "node:assert/strict";
import { bout, step, command } from "../src/fencing.js";
import { fencingController, stepFencingAI } from "../src/fencing-ai.js";
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
