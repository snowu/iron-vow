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
  run(s, 0.04);
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
  run(s, 0.11);
  assert.deepEqual(s.score, [0, 0]);
  assert.ok(s.fencers[1].bladeLost > 0.15);
  assert.equal(command(s.fencers[1], "parry"), false);
  assert.equal(command(s.fencers[0], "thrust"), true);
  run(s, 0.3);
  assert.deepEqual(s.score, [1, 0]);
});

test("feint, change line, and buffered thrust form a compound attack against a drawn parry", () => {
  const s = close(1.9),
    [a, b] = s.fencers;
  command(a, "lunge");
  run(s, 0.025);
  command(b, "parry");
  assert.ok(feint(a));
  a.line = "outside";
  assert.ok(command(a, "thrust"));
  assert.equal(a.queue, "thrust");
  run(s, 0.3);
  assert.deepEqual(s.score, [1, 0]);
  assert.equal(a.attackLine, "outside");
});
test("resting blades stay outside opposing torso and mask at minimum distance", () => {
  const s = close(RULES.minimumGap);
  for (const f of s.fencers) {
    const foe = s.fencers.find((other) => other !== f),
      g = geometry(f, foe);
    assert.ok((g.tip.x - foe.x) * f.side <= -0.25 || g.tip.y > 1.96);
  }
});
test("a scored point stops at the target surface throughout the double-touch window", () => {
  const s = close(1.9);
  command(s.fencers[0], "thrust");
  while (!s.lights[0]) step(s, 1 / 120);
  const contact = geometry(s.fencers[0], s.fencers[1]).tip;
  assert.ok(contact.x <= geometry(s.fencers[1], s.fencers[0]).torso.x - 0.249);
  run(s, 0.04);
  assert.deepEqual(geometry(s.fencers[0], s.fencers[1]).tip, contact);
});
test("a blade beat requires crossing blades and cannot displace an out-of-reach opponent", () => {
  const s = close(4);
  command(s.fencers[0], "beat");
  run(s, 0.15);
  assert.equal(s.fencers[1].bladeLost, 0);
  assert.ok(!s.events.some((e) => e.type === "beat"));
});
test("disengage follows a continuous curved point path instead of teleporting lines", () => {
  const s = close(2.3),
    f = s.fencers[0];
  command(f, "lunge");
  run(s, 0.055);
  const before = geometry(f).tip;
  assert.ok(disengage(f, "high"));
  const immediately = geometry(f).tip;
  assert.deepEqual(immediately, before);
  run(s, 0.025);
  assert.notDeepEqual(geometry(f).tip, before);
});
function parriedExchange(side = 0, offset = 0) {
  const s = close(1.9),
    a = s.fencers[side],
    b = s.fencers[1 - side];
  for (const f of s.fencers) f.x += offset;
  command(a, "thrust");
  run(s, 0.04);
  command(b, "parry");
  run(s, 0.04);
  assert.equal(b.parries, 1);
  return { s, a, b };
}
test("a timed counter-parry can answer a riposte and create a second riposte", () => {
  for (const side of [0, 1]) {
    const { s, a, b } = parriedExchange(side);
    command(b, "thrust");
    run(s, 0.05);
    assert.ok(command(a, "parry"));
    run(s, 0.05);
    assert.equal(a.parries, 1);
    assert.deepEqual(s.score, [0, 0]);
    assert.ok(
      s.events.some(
        (e) => e.type === "parry" && e.technique === "counter-parry",
      ),
    );
    a.line = "outside";
    assert.ok(command(a, "thrust"));
    run(s, 0.3);
    assert.equal(s.score[side], 1);
    assert.equal(s.score[1 - side], 0);
    assert.ok(
      s.events.some((e) => e.type === "touch" && e.technique === "riposte"),
    );
  }
});
test("early counter-parry input buffers blade recovery and preserves the committed line", () => {
  const { s, a, b } = parriedExchange();
  command(b, "thrust");
  assert.ok(command(a, "parry"));
  assert.ok(a.defenseQueue);
  a.line = "high";
  run(s, 0.08);
  assert.equal(a.parries, 1);
  assert.equal(a.parryLine, "inside");
  assert.deepEqual(s.score, [0, 0]);
});
test("a changed-line riposte defeats a counter-parry set for the original line", () => {
  const { s, a, b } = parriedExchange();
  b.line = "outside";
  command(b, "thrust");
  command(a, "parry");
  run(s, 0.3);
  assert.equal(a.parries, 0);
  assert.deepEqual(s.score, [0, 1]);
});
test("changing intended guard cannot retarget an already committed parry", () => {
  const s = close(1.9),
    [a, b] = s.fencers;
  a.line = "outside";
  command(a, "thrust");
  run(s, 0.04);
  command(b, "parry");
  b.line = "outside";
  run(s, 0.3);
  assert.equal(b.parryLine, "inside");
  assert.equal(b.parries, 0);
  assert.deepEqual(s.score, [1, 0]);
});
test("blade beats still deny counter-parry recovery", () => {
  const s = close(1.9),
    [a, b] = s.fencers;
  command(a, "beat");
  run(s, 0.2);
  assert.equal(b.displacement, "beat");
  assert.ok(b.bladeLost <= 0.12);
  assert.equal(command(b, "parry"), false);
  assert.equal(b.defenseQueue, null);
});
test("each committed parry line can physically intercept its matching thrust", () => {
  for (const line of ["high", "inside", "outside"]) {
    const s = close(1.9),
      [a, b] = s.fencers;
    a.line = b.line = line;
    command(a, "thrust");
    run(s, 0.04);
    command(b, "parry");
    run(s, 0.3);
    assert.equal(b.parries, 1, line);
    assert.deepEqual(s.score, [0, 0]);
  }
});
test("a parried fencer can choose retreat instead of counter-parrying a riposte", () => {
  const { s, a, b } = parriedExchange();
  command(a, "parry");
  assert.ok(a.defenseQueue);
  command(b, "thrust");
  assert.ok(command(a, "retreat"));
  assert.equal(a.defenseQueue, null);
  assert.ok(a.bladeLost > 0);
  run(s, 0.35);
  assert.deepEqual(s.score, [0, 0]);
});
test("displaced retreat has no invulnerability when the back line prevents escape", () => {
  const { s, a, b } = parriedExchange(0, -5.55);
  command(b, "thrust");
  assert.ok(command(a, "retreat"));
  run(s, 0.35);
  assert.deepEqual(s.score, [0, 1]);
});
