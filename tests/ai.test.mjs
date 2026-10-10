import { test } from "node:test";
import assert from "node:assert/strict";
import { controller, stepAI } from "../src/ai.js";
import { fighter, begin, tick, feint } from "../src/combat.js";
const d = {
  tactic: "defend",
  movement: "hold",
  guard_direction: "top",
  attack_direction: "left",
  on_light: "block",
  on_heavy: "parry",
  on_guardbreak: "counter",
};
function run(c, a, b, time, decision = d) {
  for (let t = 0; t < time - 1e-8; t += 1 / 120) {
    stepAI(c, a, b, decision, 1 / 120);
    tick(a, 1 / 120);
    tick(b, 1 / 120);
  }
}
test("AI waits for its reaction delay rather than instantly reading direction", () => {
  const a = fighter(0, 0),
    b = fighter(0, 2),
    c = controller("warden", () => 0.5);
  b.guard = "left";
  begin(b, "light");
  run(c, a, b, 0.075);
  assert.equal(a.guard, "top");
  assert.equal(c.reactions, 0);
  run(c, a, b, 0.075);
  assert.equal(a.guard, "left");
  assert.equal(c.reactions, 1);
});
test("feint baits the cached parry response", () => {
  const a = fighter(0, 0),
    b = fighter(0, 2),
    c = controller("duelist", () => 0.5);
  begin(b, "heavy");
  run(c, a, b, 0.1);
  feint(b);
  run(c, a, b, 0.24);
  assert.equal(a.action, "parry");
  assert.equal(c.lastReaction, "parry");
});
test("JEV chooses movement and attack direction without additional idle waits", () => {
  const a = fighter(0, 0),
    b = fighter(0, 4),
    c = controller("raider", () => 0.5);
  run(c, a, b, 0.5, {
    ...d,
    tactic: "heavy",
    movement: "advance",
    attack_direction: "right",
  });
  assert.ok(a.z > 0);
  assert.equal(a.attackDir, "right");
  assert.equal(c.decisionUsed, "heavy");
});
test("block intention stays defensive through the incoming impact", () => {
  const a = fighter(0, 0),
    b = fighter(0, 2),
    c = controller("warden", () => 0.5);
  begin(b, "heavy");
  run(c, a, b, 0.35, { ...d, tactic: "light", on_heavy: "block" });
  assert.equal(a.action, "idle");
});
test("cached JEV followup cashes in an opening immediately", () => {
  const a = fighter(0, 0),
    b = fighter(0, 1.5),
    c = controller("warden", () => 0.5);
  a.lastOutcome = "break";
  a.lastResolvedSerial = 1;
  b.stun = 0.5;
  c.cooldown = 1;
  stepAI(c, a, b, { ...d, on_opening: "light" }, 1 / 120);
  assert.equal(a.action, "light");
});
test("feint commits to the cached mixup rather than repeating feints", () => {
  const a = fighter(0, 0),
    b = fighter(0, 1.5),
    c = controller("duelist", () => 0.5);
  c.cooldown = 0;
  run(c, a, b, 0.34, { ...d, tactic: "feint", after_feint: "guardbreak" });
  assert.equal(a.action, "guardbreak");
});
