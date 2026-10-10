// Combat timing is in seconds. Render code never decides hits.
export const directions = ["left", "top", "right"];
export const specs = {
  light: {
    wind: 0.2,
    recovery: 0.16,
    damage: 13,
    cost: 8,
    reach: 2.65,
    hitstun: 0.1,
  },
  heavy: {
    wind: 0.38,
    recovery: 0.24,
    damage: 25,
    cost: 15,
    reach: 2.85,
    hitstun: 0.16,
  },
  guardbreak: {
    wind: 0.22,
    recovery: 0.15,
    damage: 0,
    cost: 10,
    reach: 2.05,
    hitstun: 0.5,
  },
};
export function fighter(x, z) {
  return {
    x,
    z,
    hp: 100,
    stamina: 100,
    guard: "top",
    guardSwitch: 0,
    action: "idle",
    attackDir: "top",
    attackSerial: 0,
    timer: 0,
    elapsed: 0,
    wind: 0,
    stun: 0,
    dodge: 0,
    dodgeElapsed: 0,
    parry: 0,
    parryCooldown: 0,
    grabbed: 0,
    counterReady: 0,
    regenDelay: 0,
    exhausted: false,
    hits: 0,
    blocks: 0,
    parries: 0,
    chain: 0,
    chainAllowed: false,
    lastType: null,
    buffer: null,
    lastOutcome: null,
    lastResolvedSerial: 0,
    pushX: 0,
    pushZ: 0,
    pushTime: 0,
    hitFlash: 0,
  };
}
export function switchGuard(f, dir) {
  if (!directions.includes(dir) || f.action === "parry" || f.grabbed > 0)
    return false;
  if (f.guard !== dir) {
    f.guard = dir;
    f.guardSwitch = 0.025;
  }
  return true;
}
export function begin(f, type) {
  const s = specs[type];
  const chaining =
    f.action === "recover" &&
    f.timer <= specs[f.lastType]?.recovery - 0.055 &&
    f.chainAllowed &&
    f.chain < 4 &&
    type !== "guardbreak";
  if (
    !s ||
    (!chaining && f.action !== "idle") ||
    f.stun > 0 ||
    f.dodge > 0 ||
    f.grabbed > 0 ||
    f.stamina < s.cost ||
    f.hp <= 0
  )
    return false;
  f.feinted = false;
  f.chain = chaining ? f.chain + 1 : 1;
  f.action = type;
  f.attackDir = f.guard;
  f.attackSerial++;
  f.wind =
    s.wind *
    (chaining ? 0.88 : 1) *
    (f.exhausted ? 1.25 : 1) *
    (f.windScale || 1);
  f.timer = f.wind;
  f.elapsed = 0;
  f.stamina -= s.cost;
  f.regenDelay = 0.25;
  f.chainAllowed = false;
  f.buffer = null;
  if (f.stamina <= 0) f.exhausted = true;
  return true;
}
// One queued action survives windup and recovery; a click is never a repeat macro.
export function requestAttack(f, type) {
  if (begin(f, type)) return "started";
  if (
    f.hp > 0 &&
    (specs[f.action] ||
      f.action === "recover" ||
      f.action === "dodge" ||
      f.action === "parry" ||
      f.stun > 0)
  ) {
    f.buffer = {
      type,
      dir: f.guard,
      ttl: Math.min(0.75, Math.max(0.28, Math.max(f.timer, f.stun) + 0.22)),
    };
    return "buffered";
  }
  return "rejected";
}
export function requestDefense(f, type) {
  const execute = type === "dodge" ? dodge : parry;
  if (execute(f)) return "started";
  if (
    f.hp > 0 &&
    (specs[f.action] ||
      f.action === "recover" ||
      f.action === "dodge" ||
      f.action === "parry" ||
      f.stun > 0)
  ) {
    f.buffer = {
      type,
      dir: f.guard,
      ttl: Math.min(0.7, Math.max(0.3, Math.max(f.timer, f.stun) + 0.2)),
    };
    return "buffered";
  }
  return "rejected";
}
export function feint(f) {
  if (
    f.action !== "heavy" ||
    f.elapsed > f.wind - 0.09 ||
    f.elapsed < 0.025 ||
    f.exhausted
  )
    return false;
  f.feinted = true;
  f.action = "recover";
  f.timer = 0.065;
  f.elapsed = 0;
  f.chainAllowed = false;
  f.stamina = Math.min(100, f.stamina + 8);
  f.lastOutcome = "feint";
  return true;
}
export function dodge(f) {
  if (
    (f.action !== "idle" && !(f.action === "recover" && f.elapsed >= 0.05)) ||
    f.stun > 0 ||
    f.grabbed > 0 ||
    f.stamina < 12 ||
    f.hp <= 0
  )
    return false;
  f.stamina -= 12;
  f.action = "dodge";
  f.timer = 0.32;
  f.elapsed = 0;
  f.dodge = 0.32;
  f.dodgeElapsed = 0;
  f.regenDelay = 0.25;
  return true;
}
export function parry(f) {
  if (
    (f.action !== "idle" && !(f.action === "recover" && f.elapsed >= 0.05)) ||
    f.stun > 0 ||
    f.grabbed > 0 ||
    f.parryCooldown > 0 ||
    f.stamina < 12 ||
    f.hp <= 0
  )
    return false;
  f.action = "parry";
  f.timer = 0.24;
  f.elapsed = 0;
  f.parry = 0;
  f.parryCooldown = 0.3;
  f.stamina -= 12;
  f.regenDelay = 0.55;
  return true;
}
export function counterBreak(f, other) {
  if (f.hp <= 0 || f.stamina < 8) return false;
  const late = f.grabbed > 0,
    anticipate =
      other?.action === "guardbreak" &&
      other.timer <= 0.24 &&
      f.action === "idle" &&
      f.stun === 0;
  if (!late && !anticipate) return false;
  if (anticipate && f.counterReady > 0) return true;
  f.stamina -= 8;
  f.regenDelay = 0.4;
  if (late) {
    f.grabbed = 0;
    f.stun = 0;
    f.action = "idle";
    if (other) {
      other.stun = 0.22;
      other.action = "idle";
    }
  } else f.counterReady = 0.3;
  return true;
}
export function tick(f, dt) {
  for (const key of [
    "stun",
    "guardSwitch",
    "parryCooldown",
    "grabbed",
    "counterReady",
    "regenDelay",
    "hitFlash",
  ])
    f[key] = Math.max(0, f[key] - dt);
  if (f.stamina <= 0) f.exhausted = true;
  if (f.exhausted && f.stamina >= 40) f.exhausted = false;
  if (!f.regenDelay && !f.stun && !specs[f.action])
    f.stamina = Math.min(100, f.stamina + (f.action === "idle" ? 44 : 24) * dt);
  if (f.buffer) {
    f.buffer.ttl -= dt;
    if (f.buffer.ttl <= 0) f.buffer = null;
  }
  if (f.action === "idle") {
    f.chain = 0;
    f.chainAllowed = false;
    consumeBuffer(f);
    return null;
  }
  f.elapsed += dt;
  f.timer -= dt;
  if (f.action === "dodge") {
    f.dodge = Math.max(0, f.timer);
    f.dodgeElapsed = f.elapsed;
  }
  if (f.action === "dodge" && f.elapsed >= 0.19 && f.buffer) {
    f.action = "idle";
    f.dodge = 0;
    consumeBuffer(f);
    return null;
  }
  if (f.action === "parry")
    f.parry = f.elapsed >= 0.015 && f.elapsed <= 0.14 ? 1 : 0;
  if (
    f.action === "recover" &&
    f.buffer &&
    ((!specs[f.buffer.type] && f.elapsed >= 0.05) ||
      (f.elapsed >= 0.055 && f.chainAllowed && f.chain < 4))
  ) {
    consumeBuffer(f);
    return null;
  }
  if (f.timer > 0) return null;
  if (!specs[f.action]) {
    f.action = "idle";
    f.dodge = 0;
    f.parry = 0;
    f.chainAllowed = false;
    consumeBuffer(f);
    return null;
  }
  const strike = { type: f.action, dir: f.attackDir, serial: f.attackSerial };
  f.lastType = f.action;
  f.timer = specs[f.action].recovery;
  f.action = "recover";
  f.elapsed = 0;
  f.chainAllowed = true;
  return strike;
}
function consumeBuffer(f) {
  if (!f.buffer) return;
  const input = f.buffer;
  f.guard = input.dir;
  const accepted =
    input.type === "dodge"
      ? dodge(f)
      : input.type === "parry"
        ? parry(f)
        : begin(f, input.type);
  if (accepted) f.buffer = null;
}
function interrupt(f, duration) {
  f.stun = duration;
  f.action = "idle";
  f.dodge = 0;
  f.parry = 0;
  f.chainAllowed = false;
  f.regenDelay = 0.25;
}
export function resolve(a, b, strike) {
  const s = specs[strike.type];
  a.lastResolvedSerial = strike.serial ?? a.attackSerial;
  if (!s || a.hp <= 0 || b.hp <= 0) return "miss";
  if (Math.hypot(a.x - b.x, a.z - b.z) > s.reach) {
    a.chainAllowed = false;
    a.lastOutcome = "miss";
    return "miss";
  }
  if (
    b.action === "dodge" &&
    b.dodgeElapsed >= 0.025 &&
    b.dodgeElapsed <= 0.19
  ) {
    a.lastOutcome = "evade";
    return "evade";
  }
  if (strike.type === "guardbreak") {
    if (b.counterReady > 0) {
      b.counterReady = 0;
      interrupt(a, 0.24);
      a.lastOutcome = "counter";
      return "counter";
    }
    // Guard breaks catch stationary guard, parry recovery, and early heavy startup.
    const vulnerable =
      b.action === "idle" ||
      b.action === "parry" ||
      b.action === "recover" ||
      (b.action === "heavy" && b.elapsed < 0.2);
    if (!vulnerable) {
      a.lastOutcome = "miss";
      return "miss";
    }
    interrupt(b, s.hitstun);
    b.grabbed = 0.22;
    b.stamina = Math.max(0, b.stamina - 15);
    a.chainAllowed = false;
    a.lastOutcome = "break";
    return "break";
  }
  if (
    b.action === "parry" &&
    b.parry > 0 &&
    b.guardSwitch === 0 &&
    b.guard === strike.dir
  ) {
    interrupt(a, strike.type === "light" ? 0.42 : 0.3);
    b.action = "idle";
    b.parry = 0;
    b.stamina = Math.min(100, b.stamina + 10);
    b.parries++;
    a.lastOutcome = "parry";
    return "parry";
  }
  const guarding =
    b.action === "idle" &&
    b.stun === 0 &&
    b.guardSwitch === 0 &&
    b.guard === strike.dir &&
    b.stamina >= 8;
  if (guarding) {
    b.stamina = Math.max(0, b.stamina - (strike.type === "heavy" ? 15 : 8));
    b.regenDelay = 0.45;
    b.blocks++;
    if (strike.type === "heavy") b.hp = Math.max(0, b.hp - 2);
    else {
      a.timer = Math.min(a.timer, 0.1);
    }
    a.lastOutcome = "block";
    return "block";
  }
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  b.pushX = ((b.x - a.x) / length) * (strike.type === "heavy" ? 5.5 : 3.6);
  b.pushZ = ((b.z - a.z) / length) * (strike.type === "heavy" ? 5.5 : 3.6);
  b.pushTime = strike.type === "heavy" ? 0.085 : 0.06;
  b.hitFlash = 0.13;
  b.hp = Math.max(0, b.hp - s.damage);
  interrupt(b, s.hitstun);
  b.hits++;
  a.lastOutcome = "hit";
  return "hit";
}
