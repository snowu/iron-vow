import { test } from "node:test";
import assert from "node:assert/strict";
import { yawToTarget, forwardFromYaw } from "../src/facing.js";
test("visual forward follows lock-on in every arena direction", () => {
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4,
      from = { x: 2, z: 3 },
      to = { x: 2 + Math.sin(angle) * 4, z: 3 + Math.cos(angle) * 4 };
    const forward = forwardFromYaw(yawToTarget(from, to));
    assert.ok(Math.abs(forward.x - Math.sin(angle)) < 1e-10);
    assert.ok(Math.abs(forward.z - Math.cos(angle)) < 1e-10);
  }
});
