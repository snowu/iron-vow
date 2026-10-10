import { command, feint, disengage, lines, MOVES } from "./fencing.js";
function weighted(distribution, random) {
  const entries = Object.entries(distribution || {}).filter(
    ([, p]) => Number.isFinite(p) && p > 0,
  );
  let roll = random() * entries.reduce((sum, [, p]) => sum + p, 0);
  for (const [choice, p] of entries) if ((roll -= p) <= 0) return choice;
  return null;
}
export const names = {
  warden: "THE TACTICIAN",
  raider: "THE PRESSER",
  duelist: "THE COUNTERFENCER",
};
export function fencingController(persona, history = [], random = Math.random) {
  return {
    persona,
    history: history.slice(-12),
    random,
    observed: null,
    compound: false,
    engaged: false,
    quietTime: 0,
    patience:
      (persona === "raider" ? 0.75 : persona === "duelist" ? 1.35 : 1.1) +
      random() * 0.45,
    initiative: null,
    openingSeen: -1,
    time: 0,
    cooldown: 0.32 + random() * 0.18,
    seen: 0,
    response: null,
    feint: false,
    parries: 0,
    followup: null,
    followupUntil: 0,
    feintedLine: null,
  };
}
// Both brains see the same instant, even though commands are applied in sequence.
export function stepFencingPair(controllers, fencers, decisions, dt) {
  const observed = fencers.map((f) => ({ ...f }));
  return fencers.map((self, i) =>
    stepFencingAI(controllers[i], self, observed[1 - i], decisions[i], dt),
  );
}
const lineMap = { top: "high", left: "inside", right: "outside" };
export function stepFencingAI(c, self, foe, decision, dt) {
  c.time += dt;
  c.cooldown = Math.max(0, c.cooldown - dt);
  const distance = Math.abs(self.x - foe.x),
    pick = (key) =>
      weighted(decision?.probabilities?.[key], c.random) || decision?.[key];
  const pressure = [self, foe].some(
    (f) =>
      ["thrust", "lunge"].includes(f.action) &&
      f.elapsed >= 0.08 &&
      f.elapsed <= MOVES[f.action].contactEnd,
  );
  c.quietTime = pressure ? 0 : c.quietTime + dt;
  if (pressure) c.initiative = null;
  if (!c.initiative && c.quietTime > c.patience && self.stamina >= 18) {
    const initiative = pick("initiative");
    if (["light", "heavy"].includes(initiative)) c.initiative = initiative;
  }
  const observation = `${foe.serial}:${foe.action}:${foe.attackLine}`;
  if (observation !== c.observed) {
    c.observed = observation;
    if (["thrust", "lunge", "beat", "parry", "retreat"].includes(foe.action)) {
      c.history.push(
        `opponent: ${foe.action} in ${foe.action === "parry" ? foe.line : foe.attackLine} line`,
      );
    } else if (foe.action === "recover" && foe.feinted) {
      c.history.push("opponent: cancelled preparation as a feint");
    }
    c.history = c.history.slice(-12);
  }
  c.engaged ||= self.serial > 0 || foe.serial > 0;
  // Establish useful measure before inviting an attack. A visible commitment or
  // low stamina still permits defense immediately, even at the opening distance.
  const openingMeasure = !c.engaged && self.stamina >= 30;
  if (openingMeasure && distance > 3.1) {
    return decision?.movement === "advance" ? 1 : 0.5;
  }
  if (c.time > c.followupUntil) c.followup = null;
  if (
    foe.serial !== c.seen &&
    ["thrust", "lunge", "beat"].includes(foe.action)
  ) {
    c.seen = foe.serial;
    const reaction =
      pick(
        foe.action === "beat"
          ? "on_guardbreak"
          : foe.action === "lunge"
            ? "on_heavy"
            : "on_light",
      ) || "parry";
    c.response = {
      reaction,
      line: foe.attackLine,
      at: c.time + (c.persona === "raider" ? 0.095 : 0.07),
    };
  }
  if (c.response && c.time >= c.response.at) {
    const r = c.response;
    c.response = null;
    let responded = false;
    if (["parry", "block"].includes(r.reaction)) {
      self.line = r.line;
      responded = command(self, "parry");
    } else if (r.reaction === "dodge") responded = command(self, "retreat");
    else if (r.reaction === "interrupt") responded = command(self, "thrust");
    else if (r.reaction === "counter") responded = command(self, "beat");
    if (responded) c.cooldown = 0.12;
  }
  if (c.feint && self.action === "lunge" && self.elapsed >= 0.045) {
    c.feintedLine = self.attackLine;
    feint(self);
    c.feint = false;
    c.cooldown = 0.075;
    c.followup = pick("after_feint") || "light";
    c.followupUntil = c.time + 1;
    c.history.push(`self: feint in ${c.feintedLine}, preparing ${c.followup}`);
    c.history = c.history.slice(-12);
  }
  if (
    c.compound &&
    ["thrust", "lunge"].includes(self.action) &&
    foe.action === "parry" &&
    foe.line === self.attackLine &&
    self.elapsed >= 0.035 &&
    self.elapsed <= 0.17 &&
    !self.connected
  ) {
    const next = lineMap[pick("attack_direction")];
    if (disengage(self, next && next !== self.attackLine ? next : null))
      c.compound = false;
  }
  if (self.parries > c.parries) {
    c.parries = self.parries;
    c.cooldown = 0;
    if (distance < 2.5) {
      const opening = pick("on_opening") || "light";
      if (opening !== "recover")
        command(self, opening === "heavy" ? "lunge" : "thrust");
      return 0;
    }
  }
  if (
    self.action === "beat" &&
    self.connected &&
    foe.bladeLost > 0 &&
    self.contactFlash > 0 &&
    self.elapsed > 0.1 &&
    command(self, "thrust")
  ) {
    c.cooldown = MOVES.thrust.duration;
    return 0;
  }
  if (self.action !== "ready")
    return decision?.movement === "retreat"
      ? -0.65
      : decision?.movement === "advance"
        ? 0.55
        : 0;
  if (self.stamina < 18) return -0.7;
  const exposed =
    foe.bladeLost > 0 ||
    foe.action === "recover" ||
    (["thrust", "lunge"].includes(foe.action) &&
      foe.elapsed > MOVES[foe.action].contactEnd);
  const punish =
    exposed &&
    c.openingSeen !== foe.serial &&
    distance < 3 &&
    decision?.on_opening;
  const tactic =
    c.initiative ||
    c.followup ||
    (punish ? pick("on_opening") : pick("tactic")) ||
    "light";
  let move = decision?.movement || "advance";
  let footwork =
    move === "retreat"
      ? -0.8
      : move === "advance"
        ? 1
        : move === "circle_left"
          ? 0.5
          : move === "circle_right"
            ? -0.5
            : 0;
  // JEV chooses intention; executable spacing respects the narrow piste.
  if (openingMeasure && footwork < 0) footwork = distance > 2.2 ? 0.35 : 0;
  if (c.initiative)
    footwork = distance > (tactic === "heavy" ? 3.1 : 2) ? 0.65 : 0.15;
  if (distance < 1.35) footwork = -0.65;
  if ((c.cooldown > 0 && !punish && !c.initiative) || c.response)
    return footwork;
  self.line =
    lineMap[pick("attack_direction")] || lines[Math.floor(c.random() * 3)];
  if (c.followup && self.line === c.feintedLine)
    self.line = lines[(lines.indexOf(self.line) + 1) % 3];
  if (tactic === "defend" || tactic === "recover") {
    self.line = lineMap[pick("guard_direction")] || self.line;
    if (punish) c.openingSeen = foe.serial;
    c.cooldown = 0.15;
    return footwork;
  }
  if (tactic === "dodge") {
    if (openingMeasure) return footwork;
    command(self, "retreat");
    c.cooldown = 0.4;
    return 0;
  }
  const type =
    tactic === "heavy" || tactic === "feint"
      ? "lunge"
      : tactic === "guardbreak"
        ? "beat"
        : "thrust";
  if (distance > (type === "lunge" ? 3.1 : type === "beat" ? 2.3 : 2.0))
    return footwork;
  if (command(self, type)) {
    if (c.initiative) {
      c.history.push(`self: took initiative with ${type} after mutual waiting`);
      c.history = c.history.slice(-12);
      c.initiative = null;
      c.quietTime = 0;
    }
    if (punish) c.openingSeen = foe.serial;
    c.compound = Boolean(c.followup);
    c.followup = null;
    c.feint = tactic === "feint";
    c.cooldown =
      MOVES[type].duration +
      (c.persona === "raider" ? 0.025 : 0.06) +
      c.random() * 0.055;
  }
  return footwork;
}
export function fencingState(self, foe, persona, history = []) {
  const action = (f) =>
    ({
      ready: "idle",
      thrust: "light",
      lunge: "heavy",
      beat: "guardbreak",
      retreat: "dodge",
      recover: "recover",
      parry: "parry",
    })[f.action];
  const line = (l) => ({ high: "top", inside: "left", outside: "right" })[l];
  const bucket = (n) => (n > 65 ? "high" : n > 30 ? "moderate" : "low");
  return {
    discipline: "fencing",
    persona,
    distance:
      Math.abs(self.x - foe.x) < 2.6
        ? "within sword reach"
        : "outside sword reach",
    self: {
      health: "high",
      stamina: bucket(self.stamina),
      action: action(self),
      guard: line(self.line),
      nearWall: Math.abs(self.x) > 5.4,
    },
    opponent: {
      health: "high",
      stamina: bucket(foe.stamina),
      action: action(foe),
      attackDirection: line(foe.attackLine),
      guard: line(foe.line),
      status:
        foe.bladeLost > 0
          ? "staggered and vulnerable"
          : foe.action === "recover"
            ? "recovering from a committed action"
            : "ready",
      parryHabit:
        foe.parries > 1
          ? "frequently parries incoming attacks"
          : foe.parries
            ? "has parried an attack"
            : "has not parried",
      blockedAttacks: "rarely blocks",
    },
    habits: history.slice(-6),
  };
}
