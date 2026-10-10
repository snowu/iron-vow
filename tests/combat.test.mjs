import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fighter,
  specs,
  begin,
  requestAttack,
  requestDefense,
  tick,
  resolve,
  feint,
  dodge,
  parry,
  switchGuard,
  counterBreak,
} from "../src/combat.js";
const run = (f, t) => {
  let result;
  for (let n = 0; n < t - 1e-8; n += 1 / 120) {
    const r = tick(f, Math.min(1 / 120, t - n));
    if (r) result = r;
  }
  return result;
};
const strike = (type = "light", dir = "top") => ({ type, dir });
test("fast attacks resolve within their advertised startup budgets", () => {
  for (const type of ["light", "heavy"]) {
    const f = fighter(0, 0);
    assert.ok(begin(f, type));
    assert.equal(run(f, specs[type].wind - 0.02), undefined);
    assert.equal(run(f, 0.03).type, type);
    assert.ok(specs[type].wind < (type === "light" ? 0.21 : 0.39));
  }
});
test("early directional followup is queued once and chains", () => {
  const f = fighter(0, 0);
  begin(f, "light");
  run(f, 0.05);
  switchGuard(f, "left");
  assert.equal(requestAttack(f, "heavy"), "buffered");
  run(f, 0.23);
  assert.equal(f.action, "heavy");
  assert.equal(f.attackDir, "left");
  assert.equal(f.chain, 2);
  run(f, 1);
  assert.equal(f.action, "idle");
  assert.equal(f.attackSerial, 2);
});
test("defense cancels anticipation but committed swings must finish", () => {
  for (const defense of [dodge, parry]) {
    let f = fighter(0, 0);
    begin(f, "light");
    assert.equal(defense(f), true);
    f = fighter(0, 0);
    begin(f, "light");
    run(f, 0.1);
    assert.equal(defense(f), false);
    run(f, 0.17);
    assert.equal(defense(f), true);
  }
});
test("guard blocks only the matching direction", () => {
  const a = fighter(0, 0),
    b = fighter(0, 1);
  switchGuard(b, "left");
  run(b, 0.03);
  assert.equal(resolve(a, b, strike("light", "left")), "block");
  assert.equal(b.hp, 100);
  assert.equal(resolve(a, b, strike("heavy", "right")), "hit");
  assert.equal(b.hp, 75);
});
test("parry has an active window and vulnerable recovery", () => {
  const a = fighter(0, 0),
    b = fighter(0, 1);
  parry(b);
  run(b, 0.06);
  assert.equal(resolve(a, b, strike("heavy")), "parry");
  assert.ok(a.stun >= 0.3);
  const c = fighter(0, 1);
  parry(c);
  run(c, 0.18);
  assert.equal(resolve(fighter(0, 0), c, strike()), "hit");
});
test("dodge evades during movement but can be punished afterward", () => {
  const a = fighter(0, 0),
    b = fighter(0, 1);
  dodge(b);
  run(b, 0.08);
  assert.equal(resolve(a, b, strike()), "evade");
  run(b, 0.14);
  assert.equal(resolve(a, b, strike()), "hit");
});
test("heavy feints allow a quick followup but not a late cancellation", () => {
  const f = fighter(0, 0);
  begin(f, "heavy");
  run(f, 0.1);
  assert.ok(feint(f));
  run(f, 0.07);
  assert.ok(begin(f, "light"));
  run(f, 0.4);
  assert.ok(begin(f, "heavy"));
  run(f, 0.32);
  assert.equal(feint(f), false);
});
test("guardbreak can be countered before or just after contact", () => {
  let a = fighter(0, 0),
    b = fighter(0, 1);
  begin(a, "guardbreak");
  run(a, 0.06);
  assert.ok(counterBreak(b, a));
  run(a, 0.18);
  assert.equal(resolve(a, b, strike("guardbreak")), "counter");
  a = fighter(0, 0);
  b = fighter(0, 1);
  assert.equal(resolve(a, b, strike("guardbreak")), "break");
  assert.ok(counterBreak(b, a));
  assert.equal(b.stun, 0);
});
test("range and stamina constrain attacks and stamina recovers", () => {
  const a = fighter(0, 0),
    b = fighter(0, 5);
  assert.equal(resolve(a, b, strike("heavy")), "miss");
  a.stamina = 0;
  assert.equal(begin(a, "light"), false);
  run(a, 1);
  assert.ok(a.stamina > 30);
});
test("defense requested during windup survives until recovery cancel", () => {
  const f = fighter(0, 0);
  begin(f, "heavy");
  run(f, 0.18);
  assert.equal(requestDefense(f, "dodge"), "buffered");
  run(f, 0.27);
  assert.equal(f.action, "dodge");
  assert.equal(f.buffer, null);
});
test("dodge flows into a queued attack when evasion ends", () => {
  const f = fighter(0, 0);
  dodge(f);
  assert.equal(requestAttack(f, "light"), "buffered");
  run(f, 0.21);
  assert.equal(f.action, "light");
  assert.equal(f.dodge, 0);
});
test("early counterattack after parry is accepted", () => {
  const f = fighter(0, 0);
  parry(f);
  assert.equal(requestAttack(f, "light"), "buffered");
  run(f, 0.26);
  assert.equal(f.action, "light");
});

test("blocked lights keep the queued chain flowing", () => {
  const a = fighter(0, 0),
    b = fighter(0, 1);
  begin(a, "light");
  requestAttack(a, "light");
  const contact = run(a, 0.21);
  assert.equal(resolve(a, b, contact), "block");
  run(a, 0.06);
  assert.equal(a.action, "light");
  assert.equal(a.chain, 2);
});
test("counterattack input survives a full parry stagger", () => {
  const f = fighter(0, 0);
  f.stun = 0.42;
  assert.equal(requestAttack(f, "light"), "buffered");
  run(f, 0.44);
  assert.equal(f.action, "light");
  assert.equal(f.attackSerial, 1);
});
