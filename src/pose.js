// Attack and recovery share the same endpoint so contact never resets the sword.
const guards = {
  top: [-2, 0.2, 0],
  left: [-1, -1.1, -0.6],
  right: [-0.7, 0.9, 0.5],
};
const ends = {
  top: [-1.3, 0.1, 0],
  left: [-1, 1.15, 0.65],
  right: [-1, -1.15, -0.65],
};
const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export function swordPose(f) {
  const guard = guards[f.guard] || guards.top;
  const dir = f.attackDir || f.guard;
  if (["light", "heavy"].includes(f.action)) {
    const t = f.elapsed / f.wind;
    const start = guards[dir],
      end = ends[dir];
    const coil = [start[0] - 0.25, start[1] * 1.15, start[2] * 1.15];
    const release = 1 - 0.085 / f.wind;
    return t < release
      ? mix(start, coil, smooth(f.elapsed / 0.035))
      : mix(coil, end, smooth((t - release) / (1 - release)));
  }
  if (f.action === "guardbreak")
    return mix(guard, [-1.4, 0, 0], smooth(f.elapsed / f.wind));
  if (f.action === "recover" && !f.feinted) {
    const end = f.lastType === "guardbreak" ? [-1.4, 0, 0] : ends[dir];
    return mix(end, guard, smooth((f.elapsed - 0.035) / 0.14));
  }
  if (f.action === "parry")
    return [-1.5, dir === "left" ? -0.65 : dir === "right" ? 0.65 : 0, 0];
  return guard;
}
