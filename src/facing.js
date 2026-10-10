// Models, guard poses, and lock-on share one forward axis: local +Z.
export function yawToTarget(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
export function forwardFromYaw(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}
