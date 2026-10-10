// Deterministic piste and weapon-tip simulation. Rendering shares these coordinates.
export const RULES = { target: 5, end: 6.5, lockout: 0.045, minimumGap: 1.05 };
export const MOVES = {
  thrust: { duration: 0.38, release: 0.09, contactEnd: 0.23, cost: 7 },
  lunge: { duration: 0.65, release: 0.1, contactEnd: 0.34, cost: 17 },
  parry: { duration: 0.26, cost: 5 },
  retreat: { duration: 0.27, cost: 9 },
  beat: { duration: 0.29, cost: 6 },
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
  const early = ["thrust", "lunge"].includes(f.action) && f.elapsed < 0.085;
  if (f.action !== "ready" && !(early && ["parry", "retreat"].includes(type))) {
    if (
      ["thrust", "lunge"].includes(type) &&
      f.elapsed > MOVES[f.action]?.duration - 0.14
    )
      f.queue = type;
    return false;
  }
  f.action = type;
  f.elapsed = 0;
  f.serial++;
  f.connected = false;
  f.attackLine = f.line;
  f.stamina -= MOVES[type].cost;
  f.feinted = false;
  f.queue = null;
  return true;
}
export function feint(f) {
  if (
    !["thrust", "lunge"].includes(f.action) ||
    f.elapsed > 0.12 ||
    f.connected
  )
    return false;
  f.action = "recover";
  f.elapsed = 0;
  f.feinted = true;
  f.queue = null;
  return true;
}
export function disengage(f) {
  if (
    !["thrust", "lunge"].includes(f.action) ||
    f.elapsed > 0.17 ||
    f.connected ||
    f.stamina < 3
  )
    return false;
  f.stamina -= 3;
  f.attackLine = lines[(lines.indexOf(f.attackLine) + 1) % 3];
  f.line = f.attackLine;
  return true;
}
export function extension(f) {
  const m = MOVES[f.action];
  if (!m || !["thrust", "lunge"].includes(f.action)) return 0;
  if (f.elapsed < m.contactEnd) return smooth((f.elapsed - m.release) / 0.12);
  return 1 - smooth((f.elapsed - m.contactEnd) / (m.duration - m.contactEnd));
}
export function geometry(f) {
  const ext = extension(f),
    line = ["thrust", "lunge"].includes(f.action) ? f.attackLine : f.line;
  const y = line === "high" ? 1.64 : line === "outside" ? 1.35 : 1.14;
  const lunge = f.action === "lunge" ? ext : 0;
  const parrying = f.action === "parry" || f.flash > 0;
  const hand = { x: 0.44 + ext * 0.4, y: 1.24 + (y - 1.24) * ext };
  const tip = { x: hand.x + 1.14, y: y + (1 - ext) * 0.16 };
  if (parrying) {
    hand.x = 0.48;
    hand.y = y;
    tip.x = 1.35;
    tip.y = y + 0.3;
  }
  if (f.bladeLost > 0) {
    tip.y -= 0.45;
    tip.x -= 0.2;
  }
  return {
    extension: ext,
    lunge,
    hand,
    tip: { x: f.x + f.side * tip.x, y: tip.y },
    localTip: tip,
    torso: { x: f.x + f.side * lunge * 0.18, y: 1.3 },
  };
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
  s.events.push({ type, side, time: s.time });
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
  const before = s.fencers.map((f) => geometry(f));
  for (let i = 0; i < 2; i++) {
    const f = s.fencers[i],
      m = MOVES[f.action];
    const old = f.x;
    f.riposte = Math.max(0, f.riposte - dt);
    f.bladeLost = Math.max(0, f.bladeLost - dt);
    f.flash = Math.max(0, f.flash - dt);
    f.stamina = Math.min(100, f.stamina + dt * (f.action === "ready" ? 25 : 8));
    f.elapsed += dt;
    let velocity = 0;
    if (f.action === "ready" || f.action === "thrust")
      velocity =
        Math.max(-1, Math.min(1, movement[i])) *
        f.side *
        2.4 *
        (f.action === "thrust" ? 0.65 : 1);
    if (f.action === "lunge" && f.elapsed > 0.1 && f.elapsed < 0.28)
      velocity = f.side * 5.2;
    if (f.action === "retreat") velocity = -f.side * 4.3;
    f.x = Math.max(-RULES.end, Math.min(RULES.end, f.x + velocity * dt));
    f.moving = Math.abs(velocity) > 0.1;
    f.travel += Math.abs(f.x - old);
    if (
      (f.action === "recover" && f.elapsed >= 0.1) ||
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
    if (f.action === "beat" && f.elapsed >= 0.12 && !f.connected) {
      f.connected = true;
      if (Math.abs(f.x - foe.x) < 2.4 && foe.action !== "retreat") {
        foe.bladeLost = 0.4;
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
    const g = geometry(f),
      target = geometry(foe).torso;
    const near = Math.abs(f.x - foe.x) < 2.5;
    const parry =
      foe.action === "parry" &&
      foe.elapsed >= 0.025 &&
      foe.elapsed <= 0.17 &&
      foe.bladeLost <= 0 &&
      foe.line === f.attackLine;
    if (parry && near) {
      f.connected = true;
      f.bladeLost = 0.3;
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
    s.halt = 1.25;
    event(s, s.lights.every(Boolean) ? "double" : "halt", s.lights[0] ? 0 : 1);
    if (s.score.some((n) => n >= RULES.target) && s.score[0] !== s.score[1]) {
      s.phase = "finished";
      s.winner = s.score[0] > s.score[1] ? 0 : 1;
      event(s, "finished", s.winner);
    }
  }
}
