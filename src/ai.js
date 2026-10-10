import {
  begin,
  switchGuard,
  feint,
  dodge,
  parry,
  counterBreak,
  specs,
} from "./combat.js";
export const profiles = {
  warden: { reaction: 0.12, pace: 0.065, feint: 0.15 },
  raider: { reaction: 0.145, pace: 0.04, feint: 0.12 },
  duelist: { reaction: 0.105, pace: 0.075, feint: 0.18 },
};
export function weighted(p, rng = Math.random) {
  const entries = Object.entries(p ?? {}).filter(
    ([, v]) => v > 0 && Number.isFinite(v),
  );
  if (!entries.length) return null;
  let n = rng() * entries.reduce((t, [, v]) => t + v, 0);
  for (const [k, v] of entries) if ((n -= v) <= 0) return k;
  return entries.at(-1)[0];
}
export function controller(persona, rng = Math.random) {
  return {
    persona,
    rng,
    time: 0,
    cooldown: 0.15,
    seenAttack: 0,
    response: null,
    feintAt: null,
    decisionUsed: null,
    reactions: 0,
    lastReaction: null,
    seenOutcome: null,
    seenParries: 0,
    followup: null,
    followupUntil: 0,
  };
}
export function stepAI(c, self, foe, decision, dt) {
  c.time += dt;
  c.cooldown = Math.max(0, c.cooldown - dt);
  const profile = profiles[c.persona] || profiles.warden;
  const outcomeKey = `${self.lastResolvedSerial}:${self.lastOutcome}`;
  if (
    (outcomeKey !== c.seenOutcome && self.lastOutcome === "break") ||
    self.parries > c.seenParries
  ) {
    c.followup =
      weighted(decision?.probabilities?.on_opening, c.rng) ||
      decision?.on_opening ||
      "light";
    c.followupUntil = c.time + 1;
    c.cooldown = 0;
    c.response = null;
  }
  c.seenOutcome = outcomeKey;
  c.seenParries = self.parries;
  if (c.time > c.followupUntil) c.followup = null;
  if (foe.attackSerial !== c.seenAttack && specs[foe.action]) {
    c.seenAttack = foe.attackSerial;
    const kind =
      foe.action === "guardbreak"
        ? "on_guardbreak"
        : foe.action === "heavy"
          ? "on_heavy"
          : "on_light";
    const reaction =
      weighted(decision?.probabilities?.[kind], c.rng) ||
      decision?.[kind] ||
      (kind === "on_guardbreak" ? "counter" : "block");
    const latency = profile.reaction + (c.rng() - 0.5) * 0.07;
    const wait =
      reaction === "parry"
        ? Math.max(latency, foe.timer - 0.075)
        : reaction === "dodge"
          ? Math.max(latency, foe.timer - 0.1)
          : latency;
    c.response = {
      reaction,
      dir: foe.attackDir,
      at: c.time + wait,
      impactAt: c.time + foe.timer,
      kind,
    };
  }
  if (c.response && c.time >= c.response.at) {
    const { reaction, dir, impactAt } = c.response;
    c.response = null;
    c.lastReaction = reaction;
    c.reactions++;
    if (self.action === "idle" && self.stun === 0) {
      if (reaction === "block") {
        switchGuard(self, dir);
        c.cooldown = Math.max(c.cooldown, impactAt - c.time + 0.035);
      }
      if (reaction === "parry") {
        switchGuard(self, dir);
        parry(self);
      }
      if (reaction === "dodge") {
        if (dodge(self)) {
          const away = normal(self.x - foe.x, self.z - foe.z);
          self.dx = away.x;
          self.dz = away.z;
        }
      }
      if (reaction === "interrupt") {
        switchGuard(
          self,
          weighted(decision?.probabilities?.attack_direction, c.rng) ||
            decision?.attack_direction ||
            "top",
        );
        begin(self, "light");
      }
      if (reaction === "counter") counterBreak(self, foe);
      c.cooldown = Math.max(c.cooldown, 0.075);
    }
  }
  if (
    self.action === "heavy" &&
    c.feintAt !== null &&
    self.elapsed >= c.feintAt
  ) {
    if (feint(self)) {
      c.cooldown = 0.03;
      c.decisionUsed = "feint";
      c.followup =
        weighted(decision?.probabilities?.after_feint, c.rng) ||
        decision?.after_feint ||
        "guardbreak";
      c.followupUntil = c.time + 1.1;
    }
    c.feintAt = null;
  }
  if (
    self.action !== "idle" ||
    self.stun > 0 ||
    self.dodge > 0 ||
    self.grabbed > 0
  ) {
    self.moving = false;
    if (
      self.stun === 0 &&
      self.dodge === 0 &&
      self.grabbed === 0 &&
      (specs[self.action] || self.action === "recover")
    ) {
      const forward = normal(foe.x - self.x, foe.z - self.z),
        distance = Math.hypot(foe.x - self.x, foe.z - self.z),
        movement = decision?.movement;
      let x = 0,
        z = 0;
      if (movement === "circle_left" || movement === "circle_right") {
        const sign = movement === "circle_left" ? -1 : 1;
        x = -forward.z * sign;
        z = forward.x * sign;
      } else if (movement === "advance" && distance > 1.8) {
        x = forward.x;
        z = forward.z;
      } else if (movement === "retreat") {
        x = -forward.x;
        z = -forward.z;
      }
      self.x += x * dt * 1.4;
      self.z += z * dt * 1.4;
      self.moving = Math.hypot(x, z) > 0.1;
    }
    return;
  }
  const distance = Math.hypot(foe.x - self.x, foe.z - self.z),
    toward = normal(foe.x - self.x, foe.z - self.z),
    side = { x: -toward.z, z: toward.x };
  let movement = decision?.movement || "advance";
  const tactic = c.followup || decision?.tactic || "light";
  // Physics enforces reach. An offensive intent closes the remaining gap.
  if (
    ["light", "heavy", "guardbreak", "feint"].includes(tactic) &&
    distance > (tactic === "guardbreak" ? 1.9 : 2.45) &&
    movement === "hold"
  )
    movement = "advance";
  let vx = 0,
    vz = 0;
  if (movement === "advance" && distance > 1.65) {
    vx = toward.x;
    vz = toward.z;
  } else if (movement === "retreat" && distance < 4.5) {
    vx = -toward.x * 0.8;
    vz = -toward.z * 0.8;
  } else if (movement === "circle_left" || movement === "circle_right") {
    const sign = movement === "circle_left" ? -1 : 1;
    vx = side.x * sign * 0.7;
    vz = side.z * sign * 0.7;
    if (distance > 2.7) {
      vx += toward.x * 0.5;
      vz += toward.z * 0.5;
    }
  }
  self.x += vx * dt * 3.3;
  self.z += vz * dt * 3.3;
  self.moving = Math.hypot(vx, vz) > 0.1;
  // Never continuously read the player's guard/attack direction. Only the delayed
  // reaction above uses an observed telegraph; idle anticipation comes from JEV.
  if (!c.response && foe.action === "idle")
    switchGuard(self, decision?.guard_direction || "top");
  if (c.cooldown > 0 || c.response || self.stamina < 8) return;
  if (tactic === "defend" || tactic === "recover") {
    c.followup = null;
    c.cooldown = 0.1;
    return;
  }
  if (tactic === "dodge") {
    if (distance < 3 && dodge(self)) {
      self.dx = -toward.x;
      self.dz = -toward.z;
    }
    c.cooldown = 0.22;
    return;
  }
  const type = tactic === "feint" ? "heavy" : tactic;
  const reach = specs[type]?.reach;
  if (!reach || distance > reach + 0.12) return;
  switchGuard(
    self,
    weighted(decision?.probabilities?.attack_direction, c.rng) ||
      decision?.attack_direction ||
      "top",
  );
  if (begin(self, type)) {
    c.feintAt =
      tactic === "feint" ? Math.max(0.07, (self.wind - 0.095) * 0.85) : null;
    c.cooldown = specs[type].wind + specs[type].recovery + profile.pace;
    c.decisionUsed = tactic;
    c.followup = null;
  }
}
function normal(x, z) {
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}
