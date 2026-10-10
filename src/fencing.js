// Deterministic piste and weapon-tip simulation. Rendering shares these coordinates.
export const RULES = { target: 5, end: 6.5, lockout: 0.045, minimumGap: 1.5 };
export const MOVES = {
  thrust: { duration: 0.28, release: 0.035, contactEnd: 0.16, cost: 7 },
  lunge: { duration: 0.44, release: 0.045, contactEnd: 0.24, cost: 17 },
  parry: { duration: 0.2, cost: 5 },
  retreat: { duration: 0.19, cost: 9 },
  beat: { duration: 0.2, cost: 6 },
};
export const lines = ["high", "inside", "outside"];
export const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export function fencer(side) {
  return {
    side,
    x: side === 1 ? -2 : 2,
    action: "ready",
    elapsed: 0,
    line: "inside",
    attackLine: "inside",
    serial: 0,
    connected: false,
    stamina: 100,
    parries: 0,
    riposte: 0,
    bladeLost: 0,
    flash: 0,
    moving: 0,
    travel: 0,
    feinted: false,
    queue: null,
    entryExtension: 0,
    touchTip: null,
    beatTip: null,
    contactFlash: 0,
    recoverExtension: 0,
    previousLine: "inside",
    disengageAt: -1,
  };
}
export function bout() {
  return {
    fencers: [fencer(1), fencer(-1)],
    score: [0, 0],
    phase: "fence",
    time: 0,
    firstTouch: null,
    lights: [false, false],
    halt: 0,
    exchange: 1,
    events: [],
    winner: null,
  };
}
export function command(f, type) {
  if (!MOVES[type] || f.stamina < MOVES[type].cost || f.bladeLost > 0)
    return false;
  const attacking = ["thrust", "lunge"].includes(f.action);
  const early = attacking && f.elapsed < MOVES[f.action].release;
  const recovery = attacking && f.elapsed > MOVES[f.action].contactEnd + 0.035;
  const prepared = f.action === "beat" && f.elapsed > 0.1;
  if (
    f.action !== "ready" &&
    !recovery &&
    !prepared &&
    !(early && ["parry", "retreat"].includes(type))
  ) {
    if (
      ["thrust", "lunge"].includes(type) &&
      (f.action === "recover" || f.elapsed > MOVES[f.action]?.release)
    ) {
      f.queue = type;
      return true;
    }
    return false;
  }
  f.entryExtension = extension(f);
  f.touchTip = null;
  f.beatTip = null;
  f.action = type;
  f.elapsed = 0;
  f.serial++;
  f.connected = false;
  f.attackLine = f.line;
  f.previousLine = f.line;
  f.disengageAt = -1;
  f.stamina -= MOVES[type].cost;
  f.feinted = false;
  f.queue = null;
  return true;
}
export function feint(f) {
  if (
    !["thrust", "lunge"].includes(f.action) ||
    f.elapsed > 0.075 ||
    f.connected
  )
    return false;
  f.recoverExtension = extension(f);
  f.action = "recover";
  f.elapsed = 0;
  f.feinted = true;
  f.queue = null;
  return true;
}
export function disengage(f, nextLine = null) {
  if (
    !["thrust", "lunge"].includes(f.action) ||
    f.elapsed > 0.17 ||
    f.connected ||
    f.stamina < 3 ||
    nextLine === f.attackLine ||
    (nextLine && !lines.includes(nextLine))
  )
    return false;
  f.stamina -= 3;
  f.previousLine = f.attackLine;
  f.disengageAt = f.elapsed;
  f.attackLine = nextLine || lines[(lines.indexOf(f.attackLine) + 1) % 3];
  f.line = f.attackLine;
  return true;
}
export function extension(f) {
  if (f.action === "recover")
    return f.recoverExtension * (1 - smooth(f.elapsed / 0.08));
  const m = MOVES[f.action];
  if (!m || !["thrust", "lunge"].includes(f.action)) return 0;
  if (f.elapsed < m.contactEnd)
    return (
      f.entryExtension * (1 - smooth(f.elapsed / 0.05)) +
      smooth((f.elapsed - m.release) / 0.085)
    );
  return 1 - smooth((f.elapsed - m.contactEnd) / (m.duration - m.contactEnd));
}
export function geometry(f, foe = null) {
  const ext = Math.min(1, extension(f));
  const line = ["thrust", "lunge"].includes(f.action) ? f.attackLine : f.line;
  const lineY = (value) =>
    value === "high" ? 1.64 : value === "outside" ? 1.35 : 1.14;
  const transition =
    f.disengageAt >= 0 ? smooth((f.elapsed - f.disengageAt) / 0.06) : 1;
  const targetY =
    lineY(f.previousLine || line) +
    (lineY(line) - lineY(f.previousLine || line)) * transition;
  const lunge = f.action === "lunge" ? ext : 0;
  const hand = { x: 0.44 + ext * 0.4, y: 1.27 + (targetY - 1.27) * ext };
  let angle =
    0.63 * (1 - ext) +
    (f.disengageAt >= 0 ? Math.sin(transition * Math.PI) * 0.22 : 0);
  if (f.action === "parry" || (f.flash > 0 && f.action === "ready")) {
    hand.x = 0.5;
    hand.y = f.line === "high" ? 1.5 : f.line === "outside" ? 1.4 : 1.28;
    angle = 0.9;
  }
  if (f.action === "beat") {
    const swing = Math.sin(Math.min(1, f.elapsed / 0.14) * Math.PI);
    hand.x = 0.48;
    hand.y = 1.28;
    angle = 0.63 - swing * 0.4;
  }
  if (f.bladeLost > 0) angle = 1.1;
  let tip = {
    x: hand.x + Math.cos(angle) * 1.14,
    y: hand.y + Math.sin(angle) * 1.14,
  };
  // A resting or displaced blade points upward before entering the other body.
  if (foe && (!active(f) || f.connected)) {
    const bodyX =
      foe.x + foe.side * (foe.action === "lunge" ? extension(foe) * 0.18 : 0);
    const surface = (bodyX - f.x) * f.side - 0.29;
    if (tip.x > surface) {
      tip.x = Math.max(hand.x + 0.1, surface);
      tip.y =
        hand.y + Math.sqrt(Math.max(0, 1.14 ** 2 - (tip.x - hand.x) ** 2));
    }
  }
  if (f.touchTip) tip = { x: (f.touchTip.x - f.x) * f.side, y: f.touchTip.y };
  return {
    extension: ext,
    lunge,
    hand,
    tip: { x: f.x + f.side * tip.x, y: tip.y },
    localTip: tip,
    torso: { x: f.x + f.side * lunge * 0.18, y: 1.3 },
    worldHand: { x: f.x + f.side * hand.x, y: hand.y },
  };
}
export function bladeIntersection(a, b) {
  const ah = a.worldHand,
    bh = b.worldHand;
  const r = { x: a.tip.x - ah.x, y: a.tip.y - ah.y },
    s = { x: b.tip.x - bh.x, y: b.tip.y - bh.y };
  const cross = (u, v) => u.x * v.y - u.y * v.x,
    den = cross(r, s);
  if (Math.abs(den) < 1e-8) return null;
  const delta = { x: bh.x - ah.x, y: bh.y - ah.y },
    t = cross(delta, s) / den,
    u = cross(delta, r) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
    ? { x: ah.x + t * r.x, y: ah.y + t * r.y }
    : null;
}
const active = (f) =>
  ["thrust", "lunge"].includes(f.action) &&
  f.elapsed >= MOVES[f.action].release &&
  f.elapsed <= MOVES[f.action].contactEnd &&
  !f.connected &&
  f.bladeLost <= 0;
function crosses(a, b, left, right) {
  return Math.max(a, b) >= left && Math.min(a, b) <= right;
}
function event(s, type, side) {
  s.events.push({
    type,
    side,
    time: s.time,
    ...(s.contactPoint ? { point: { ...s.contactPoint } } : {}),
  });
  s.contactPoint = null;
  s.events = s.events.slice(-12);
}
export function resetExchange(s) {
  s.fencers = [fencer(1), fencer(-1)];
  s.firstTouch = null;
  s.lights = [false, false];
  s.halt = 0;
  s.phase = "fence";
  s.exchange++;
}
export function step(s, dt, movement = [0, 0]) {
  if (s.phase === "finished") return;
  s.time += dt;
  if (s.phase === "halt") {
    s.halt -= dt;
    if (s.halt <= 0) resetExchange(s);
    return;
  }
  const before = s.fencers.map((f, i) => geometry(f, s.fencers[1 - i]));
  for (let i = 0; i < 2; i++) {
    const f = s.fencers[i],
      m = MOVES[f.action];
    const old = f.x;
    f.riposte = Math.max(0, f.riposte - dt);
    f.bladeLost = Math.max(0, f.bladeLost - dt);
    f.flash = Math.max(0, f.flash - dt);
    f.contactFlash = Math.max(0, f.contactFlash - dt);
    f.stamina = Math.min(100, f.stamina + dt * (f.action === "ready" ? 25 : 8));
    if (!f.touchTip) f.elapsed += dt;
    let velocity = 0;
    if (
      ["ready", "thrust", "beat", "parry", "recover"].includes(f.action) ||
      (f.action === "lunge" && f.elapsed > 0.24)
    )
      velocity = Math.max(-1, Math.min(1, movement[i])) * f.side * 3.6;
    if (f.action === "lunge" && f.elapsed > 0.045 && f.elapsed < 0.205)
      velocity = f.side * 6.3;
    if (f.action === "retreat") velocity = -f.side * 6.1;
    f.x = Math.max(-RULES.end, Math.min(RULES.end, f.x + velocity * dt));
    f.moving = Math.abs(velocity) > 0.1;
    f.travel += Math.abs(f.x - old);
    if (
      (f.action === "recover" && f.elapsed >= 0.08) ||
      (m && f.elapsed >= m.duration)
    ) {
      f.action = "ready";
      f.elapsed = 0;
      const q = f.queue;
      f.queue = null;
      if (q) command(f, q);
    }
  }
  const [a, b] = s.fencers;
  if (b.x - a.x < RULES.minimumGap) {
    const middle = (a.x + b.x) / 2;
    a.x = middle - RULES.minimumGap / 2;
    b.x = middle + RULES.minimumGap / 2;
    a.x = Math.max(-RULES.end, a.x);
    b.x = Math.min(RULES.end, b.x);
  }
  // A blade beat is a short-range preparation, not a grab or a scoring attack.
  for (let i = 0; i < 2; i++) {
    const f = s.fencers[i],
      foe = s.fencers[1 - i];
    if (f.action === "beat" && f.elapsed >= 0.065 && !f.connected) {
      f.connected = true;
      const contact = bladeIntersection(geometry(f, foe), geometry(foe, f));
      if (contact && foe.action !== "retreat") {
        s.contactPoint = contact;
        f.contactFlash = 0.1;
        foe.contactFlash = 0.1;
        foe.bladeLost = 0.24;
        foe.queue = null;
        event(s, "beat", i);
      } else event(s, "miss", i);
    }
  }
  const contacts = [];
  for (let i = 0; i < 2; i++) {
    const f = s.fencers[i],
      foe = s.fencers[1 - i];
    if (!active(f)) continue;
    const g = geometry(f, foe),
      target = geometry(foe, f).torso;
    const bladeContact = bladeIntersection(g, geometry(foe, f));
    const parry =
      foe.action === "parry" &&
      foe.elapsed >= 0.01 &&
      foe.elapsed <= 0.13 &&
      foe.bladeLost <= 0 &&
      foe.line === f.attackLine;
    if (parry && bladeContact) {
      f.connected = true;
      f.bladeLost = 0.19;
      f.contactFlash = foe.contactFlash = 0.1;
      s.contactPoint = bladeContact;
      foe.riposte = 0.42;
      foe.parries++;
      foe.flash = 0.16;
      foe.action = "ready";
      foe.elapsed = 0;
      event(s, "parry", 1 - i);
      continue;
    }
    const oldRelative = before[i].tip.x - before[1 - i].torso.x,
      newRelative = g.tip.x - target.x;
    if (
      g.tip.y >= 0.45 &&
      g.tip.y <= 1.95 &&
      crosses(oldRelative, newRelative, -0.25, 0.25)
    ) {
      f.connected = true;
      f.touchTip = { x: target.x - f.side * 0.25, y: g.tip.y };
      contacts.push(i);
    } else if (f.elapsed + dt > MOVES[f.action].contactEnd && !f.connected) {
      f.connected = true;
      event(s, "miss", i);
    }
  }
  for (const i of contacts) {
    if (
      !s.lights[i] &&
      (s.firstTouch === null || s.time - s.firstTouch <= RULES.lockout + 1e-9)
    ) {
      s.lights[i] = true;
      s.score[i]++;
      if (s.firstTouch === null) s.firstTouch = s.time;
      event(s, "touch", i);
    }
  }
  if (s.firstTouch !== null && s.time - s.firstTouch >= RULES.lockout) {
    s.phase = "halt";
    s.halt = 0.7;
    event(s, s.lights.every(Boolean) ? "double" : "halt", s.lights[0] ? 0 : 1);
    if (s.score.some((n) => n >= RULES.target) && s.score[0] !== s.score[1]) {
      s.phase = "finished";
      s.winner = s.score[0] > s.score[1] ? 0 : 1;
      event(s, "finished", s.winner);
    }
  }
}
