import { test } from "node:test";
import assert from "node:assert/strict";
import { fighter, begin, dodge } from "../src/combat.js";
import { stepDuel } from "../src/world.js";
test("fighters cannot overlap or move beyond arena", () => {
  const a = fighter(0, 0),
    b = fighter(0, 0);
  stepDuel(a, b, 1 / 120);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 1.299);
  a.x = 7.99;
  for (let i = 0; i < 200; i++)
    stepDuel(a, b, 1 / 120, { move: { x: 1, z: 0 } });
  assert.ok(Math.hypot(a.x, a.z) <= 8.0001);
});
test("fixed-step duel resolves the actual same combat rules used by renderer", () => {
  const a = fighter(0, 0),
    b = fighter(0, 2.5);
  a.guard = "left";
  begin(a, "light");
  const events = [];
  for (let i = 0; i < 120; i++) events.push(...stepDuel(a, b, 1 / 120));
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, "hit");
  assert.equal(b.hp, 87);
});
test("dodge movement finishes before its recovery ends", () => {
  const a = fighter(0, 0),
    b = fighter(0, 4);
  dodge(a);
  a.dx = 1;
  a.dz = 0;
  for (let i = 0; i < 24; i++) stepDuel(a, b, 1 / 120);
  const x = a.x;
  for (let i = 0; i < 10; i++) stepDuel(a, b, 1 / 120);
  assert.equal(a.x, x);
  assert.equal(a.action, "dodge");
});

test("movement remains responsive during attack startup and recovery", () => {
  const a = fighter(0, 0),
    b = fighter(0, 4);
  begin(a, "heavy");
  for (let i = 0; i < 12; i++)
    stepDuel(a, b, 1 / 120, { move: { x: 1, z: 0 } });
  assert.ok(a.x > 0.2);
});
