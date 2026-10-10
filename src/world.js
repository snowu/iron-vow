import { tick, resolve, specs } from "./combat.js";
export function stepDuel(
  player,
  enemy,
  dt,
  { move = { x: 0, z: 0 }, enemyStep = () => {}, onImpact = () => {} } = {},
) {
  player.moving =
    Math.hypot(move.x, move.z) > 0.1 &&
    player.stun <= 0 &&
    player.action !== "dodge" &&
    player.grabbed === 0;
  if (player.moving) {
    player.x += move.x * dt * 4.4;
    player.z += move.z * dt * 4.4;
  }
  enemyStep(dt);
  for (const [f, other] of [
    [player, enemy],
    [enemy, player],
  ]) {
    if (f.pushTime > 0) {
      const step = Math.min(dt, f.pushTime);
      f.x += f.pushX * step;
      f.z += f.pushZ * step;
      f.pushTime = Math.max(0, f.pushTime - dt);
    }
    if (f.dodge > 0 && f.dodgeElapsed < 0.17) {
      f.x += (f.dx || 0) * dt * 9;
      f.z += (f.dz || 0) * dt * 9;
    }
    if (specs[f.action] && f.elapsed > f.wind - 0.085) {
      const distance = Math.hypot(other.x - f.x, other.z - f.z) || 1;
      if (distance > 1.5) {
        f.x += ((other.x - f.x) / distance) * dt * 4.5;
        f.z += ((other.z - f.z) / distance) * dt * 4.5;
      }
    }
    clamp(f);
  }
  const distance = Math.hypot(player.x - enemy.x, player.z - enemy.z);
  if (distance < 1.3) {
    const x = distance > 1e-6 ? (player.x - enemy.x) / distance : 1,
      z = distance > 1e-6 ? (player.z - enemy.z) / distance : 0,
      push = (1.3 - distance) / 2;
    player.x += x * push;
    player.z += z * push;
    enemy.x -= x * push;
    enemy.z -= z * push;
    clamp(player);
    clamp(enemy);
  }
  const ps = tick(player, dt),
    es = tick(enemy, dt),
    events = [];
  if (ps) {
    const outcome = resolve(player, enemy, ps);
    events.push({ attacker: "player", strike: ps, outcome });
    onImpact(player, enemy, ps, outcome);
  }
  if (es) {
    const outcome = resolve(enemy, player, es);
    events.push({ attacker: "enemy", strike: es, outcome });
    onImpact(enemy, player, es, outcome);
  }
  return events;
}
function clamp(f) {
  const radius = Math.hypot(f.x, f.z);
  if (radius > 8) {
    f.x *= 8 / radius;
    f.z *= 8 / radius;
  }
}
