import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bout,
  step,
  command,
  feint,
  disengage,
  geometry,
  RULES,
} from "../src/fencing.js";
const run = (s, t, m = [0, 0]) => {
  for (let i = 0; i < Math.round(t * 120); i++) step(s, 1 / 120, m);
};
function close(gap = 2) {
  const s = bout();
  s.fencers[0].x = -gap / 2;
  s.fencers[1].x = gap / 2;
  return s;
}
test("a point that extends into the target scores one touch and halts", () => {
  const s = close(1.9);
  command(s.fencers[0], "thrust");
  run(s, 0.4);
  assert.deepEqual(s.score, [1, 0]);
  assert.equal(s.phase, "halt");
});
test("a short thrust misses; lunge footwork can cover the same distance", () => {
  const short = close(2.7);
  command(short.fencers[0], "thrust");
  run(short, 0.4);
  assert.deepEqual(short.score, [0, 0]);
  const long = close(2.7);
  command(long.fencers[0], "lunge");
  run(long, 0.5);
  assert.deepEqual(long.score, [1, 0]);
});
test("near simultaneous thrusts score double without update-order bias", () => {
  for (const first of [0, 1]) {
    const s = close(1.9);
    command(s.fencers[first], "thrust");
    command(s.fencers[1 - first], "thrust");
    run(s, 0.4);
    assert.deepEqual(s.score, [1, 1]);
    assert.equal(s.phase, "halt");
  }
});
test("the lockout rejects a counter arriving after its window", () => {
  const s = close(1.9);
  command(s.fencers[0], "thrust");
  run(s, 0.1);
  command(s.fencers[1], "thrust");
  run(s, 0.4);
  assert.deepEqual(s.score, [1, 0]);
});
test("holding a blade line is not a passive block", () => {
  const s = close(1.9);
  command(s.fencers[0], "thrust");
  run(s, 0.35);
  assert.equal(s.score[0], 1);
});
test("matching timed parry displaces blade and allows immediate riposte", () => {
  const s = close(1.9),
    [a, b] = s.fencers;
  command(a, "thrust");
  run(s, 0.075);
  command(b, "parry");
  run(s, 0.04);
  assert.equal(b.parries, 1);
  assert.ok(b.riposte > 0);
  assert.equal(b.action, "ready");
  assert.equal(command(b, "thrust"), true);
  run(s, 0.35);
  assert.deepEqual(s.score, [0, 1]);
});
test("disengage defeats a parry set for the previous line", () => {
  const s = close(1.9);
  command(s.fencers[0], "thrust");
  run(s, 0.06);
  disengage(s.fencers[0]);
  command(s.fencers[1], "parry");
  run(s, 0.35);
  assert.deepEqual(s.score, [1, 0]);
});
test("retreat makes a thrust short using distance, not invulnerability", () => {
  const s = close(2);
  command(s.fencers[0], "thrust");
  command(s.fencers[1], "retreat");
  run(s, 0.4);
  assert.deepEqual(s.score, [0, 0]);
  const trapped = close(1.5);
  trapped.fencers[1].x = RULES.end;
  trapped.fencers[0].x = RULES.end - 1.5;
  command(trapped.fencers[0], "thrust");
  command(trapped.fencers[1], "retreat");
  run(trapped, 0.4);
  assert.equal(trapped.score[0], 1);
});
test("feint cannot score and is rejected after commitment", () => {
  const s = close();
  command(s.fencers[0], "lunge");
  run(s, 0.05);
  assert.ok(feint(s.fencers[0]));
  run(s, 0.3);
  assert.equal(s.score[0], 0);
  command(s.fencers[0], "lunge");
  run(s, 0.17);
  assert.equal(feint(s.fencers[0]), false);
});
test("touch reset preserves score and restores en-garde separation", () => {
  const s = close(1.9);
  command(s.fencers[0], "thrust");
  run(s, 1.8);
  assert.deepEqual(s.score, [1, 0]);
  assert.equal(s.phase, "fence");
  assert.equal(s.fencers[0].x, -2);
  assert.equal(s.exchange, 2);
});
test("first to five requires a leader; a deciding double at 4-all continues", () => {
  const s = close(1.9);
  s.score = [4, 4];
  command(s.fencers[0], "thrust");
  command(s.fencers[1], "thrust");
  run(s, 0.4);
  assert.equal(s.phase, "halt");
  assert.deepEqual(s.score, [5, 5]);
  const win = close(1.9);
  win.score = [4, 3];
  command(win.fencers[0], "thrust");
  run(win, 0.4);
  assert.equal(win.phase, "finished");
  assert.equal(win.winner, 0);
});
test("fencers remain on piste and cannot pass through each other", () => {
  const s = bout();
  run(s, 12, [1, 1]);
  assert.ok(s.fencers[1].x - s.fencers[0].x >= RULES.minimumGap - 1e-9);
  run(s, 12, [-1, -1]);
  assert.ok(s.fencers.every((f) => Math.abs(f.x) <= RULES.end));
});
test("weapon geometry keeps hand within articulated arm reach", () => {
  for (const action of ["ready", "thrust", "lunge", "parry", "retreat", "beat"])
    for (let t = 0; t < 0.7; t += 1 / 120) {
      const f = { ...bout().fencers[0], action, elapsed: t };
      const g = geometry(f);
      assert.ok(
        Math.hypot(g.hand.x - g.lunge * 0.18 - 0.18, g.hand.y - 1.45) < 0.74,
      );
    }
});

test("blade beat creates enough time to prepare a thrust without itself scoring", () => {
  const s = close(1.9);
  command(s.fencers[0], "beat");
  run(s, 0.3);
  assert.deepEqual(s.score, [0, 0]);
  assert.ok(s.fencers[1].bladeLost > 0.2);
  assert.equal(command(s.fencers[1], "parry"), false);
  assert.equal(command(s.fencers[0], "thrust"), true);
  run(s, 0.3);
  assert.deepEqual(s.score, [1, 0]);
});
