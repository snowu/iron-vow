// Attack and recovery share the same endpoint so contact never resets the sword.
const guards = {
  top: [-1.45, 0.12, 0, -0.95, 0],
  left: [-0.8, -0.35, -0.65, -1.05, 0],
  right: [-0.8, 0.4, 0.65, -1.05, 0],
};
const ends = {
  top: [-0.75, 0.1, 0, -0.55, -0.25],
  left: [-0.8, 0.4, 0.7, -0.55, 0],
  right: [-0.8, -0.35, -0.7, -0.55, 0],
};
const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export function swordPose(f) {
  const guard = guards[f.guard] || guards.top;
  const dir = f.attackDir || f.guard;
  if (f.blockFlash > 0 || f.parryFlash > 0 || f.action === "parry") {
    const defense = f.action === "parry" ? f.guard : f.defenseDir || f.guard;
    return defense === "top"
      ? [-1.3, 0.12, 0, -1.15, 0.35]
      : [
          -1.0,
          defense === "left" ? -0.35 : 0.4,
          defense === "left" ? -0.6 : 0.6,
          -1.1,
          0.2,
        ];
  }
  if (["light", "heavy"].includes(f.action)) {
    const t = f.elapsed / f.wind;
    const start = guards[dir],
      end = ends[dir];
    const coil = [
      start[0] - 0.12,
      start[1],
      start[2],
      start[3] - 0.15,
      start[4],
    ];
    const release = 1 - 0.085 / f.wind;
    return t < release
      ? mix(start, coil, smooth(f.elapsed / 0.035))
      : mix(coil, end, smooth((t - release) / (1 - release)));
  }
  if (f.action === "guardbreak")
    return mix(guard, [-0.9, 0, 0, -0.3, 0], smooth(f.elapsed / f.wind));
  if (f.action === "recover" && !f.feinted) {
    const end = f.lastType === "guardbreak" ? [-0.9, 0, 0, -0.3, 0] : ends[dir];
    return mix(end, guard, smooth((f.elapsed - 0.035) / 0.14));
  }
  return guard;
}
