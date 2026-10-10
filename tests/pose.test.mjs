import { test } from "node:test";
import assert from "node:assert/strict";
import { swordPose } from "../src/pose.js";
for (const dir of ["left", "top", "right"]) {
  test(`${dir} sword pose continues through contact without resetting`, () => {
    const atContact = swordPose({
      action: "light",
      attackDir: dir,
      guard: dir,
      elapsed: 0.2,
      wind: 0.2,
    });
    const afterContact = swordPose({
      action: "recover",
      lastType: "light",
      attackDir: dir,
      guard: dir,
      elapsed: 0,
    });
    afterContact.forEach((v, i) =>
      assert.ok(Math.abs(v - atContact[i]) < 1e-9),
    );
    const ready = swordPose({ action: "idle", guard: dir });
    const recovered = swordPose({
      action: "recover",
      lastType: "light",
      attackDir: dir,
      guard: dir,
      elapsed: 0.18,
    });
    recovered.forEach((v, i) => assert.ok(Math.abs(v - ready[i]) < 1e-9));
  });
}
test("feint returns toward guard without playing the contact pose", () => {
  const pose = swordPose({
    action: "recover",
    guard: "top",
    attackDir: "top",
    lastType: "heavy",
    elapsed: 0,
    feinted: true,
  });
  assert.deepEqual(pose, swordPose({ action: "idle", guard: "top" }));
});

test("arm poses keep elbows bending forward without sideways shoulder dislocation", () => {
  for (const guard of ["left", "top", "right"])
    for (const action of [
      "idle",
      "light",
      "heavy",
      "recover",
      "parry",
      "guardbreak",
      "dodge",
    ])
      for (let elapsed = 0; elapsed <= 0.4; elapsed += 1 / 120) {
        const pose = swordPose({
          guard,
          attackDir: guard,
          action,
          elapsed,
          wind: 0.4,
          lastType: "heavy",
        });
        assert.ok(pose.every(Number.isFinite));
        assert.ok(
          pose[3] <= 0 && pose[3] >= -2.2,
          "elbow must bend forward within its joint limit",
        );
        assert.ok(
          Math.abs(pose[1]) <= 0.6,
          "upper arm must not swing sideways through the torso",
        );
      }
});
