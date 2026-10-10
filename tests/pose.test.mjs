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
