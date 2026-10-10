import { command, feint, lines, MOVES } from "./fencing.js";
function weighted(distribution) {
  const entries = Object.entries(distribution || {}).filter(
    ([, p]) => Number.isFinite(p) && p > 0,
  );
  let roll = Math.random() * entries.reduce((sum, [, p]) => sum + p, 0);
  for (const [choice, p] of entries) if ((roll -= p) <= 0) return choice;
  return null;
}
export const names = {
  warden: "THE TACTICIAN",
  raider: "THE PRESSER",
  duelist: "THE COUNTERFENCER",
};
export function fencingController(persona) {
  return {
    persona,
    time: 0,
    cooldown: 0.45,
    seen: 0,
    response: null,
    feint: false,
    parries: 0,
    followup: null,
    followupUntil: 0,
    feintedLine: null,
  };
}
const lineMap = { top: "high", left: "inside", right: "outside" };
export function stepFencingAI(c, self, foe, decision, dt) {
  c.time += dt;
  c.cooldown = Math.max(0, c.cooldown - dt);
  const distance = Math.abs(self.x - foe.x),
    pick = (key) => weighted(decision?.probabilities?.[key]) || decision?.[key];
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
    if (["parry", "block"].includes(r.reaction)) {
      self.line = r.line;
      command(self, "parry");
    } else if (r.reaction === "dodge") command(self, "retreat");
    else if (r.reaction === "interrupt") command(self, "thrust");
    c.cooldown = 0.12;
  }
  if (c.feint && self.action === "lunge" && self.elapsed >= 0.045) {
    c.feintedLine = self.attackLine;
    feint(self);
    c.feint = false;
    c.cooldown = 0.075;
    c.followup = pick("after_feint") || "light";
    c.followupUntil = c.time + 1;
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
  const tactic = c.followup || decision?.tactic || "light";
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
  if (distance > 2.9 && tactic !== "defend") footwork = 1;
  if (distance < 1.35) footwork = -0.65;
  if (c.cooldown > 0 || c.response) return footwork;
  self.line =
    lineMap[pick("attack_direction")] || lines[Math.floor(Math.random() * 3)];
  if (c.followup && self.line === c.feintedLine)
    self.line = lines[(lines.indexOf(self.line) + 1) % 3];
  if (tactic === "defend" || tactic === "recover") {
    c.cooldown = 0.15;
    return distance > 3 ? 0.25 : footwork;
  }
  if (tactic === "dodge") {
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
    return Math.max(0.6, footwork);
  if (command(self, type)) {
    c.followup = null;
    c.feint = tactic === "feint";
    c.cooldown = MOVES[type].duration + (c.persona === "raider" ? 0.025 : 0.06);
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
