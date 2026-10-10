export function createBrain() {
  return {
    decision: null,
    decisionAt: 0,
    liveCount: 0,
    failures: 0,
    pending: false,
    lastBrain: -100,
  };
}
const bucket = (n) => (n > 65 ? "high" : n > 30 ? "moderate" : "low");
export function duelState(self, foe, persona, history = []) {
  return {
    persona,
    distance:
      Math.hypot(self.x - foe.x, self.z - foe.z) < 2.7
        ? "within sword reach"
        : "outside sword reach",
    self: {
      health: bucket(self.hp),
      stamina: bucket(self.stamina),
      action: self.action,
      guard: self.guard,
      nearWall: Math.hypot(self.x, self.z) > 7,
    },
    opponent: {
      health: bucket(foe.hp),
      stamina: bucket(foe.stamina),
      action: foe.action,
      attackDirection: foe.attackDir,
      guard: foe.guard,
      status:
        foe.stun > 0
          ? "staggered and vulnerable"
          : foe.action === "recover"
            ? "recovering from a committed action"
            : "ready",
      parryHabit:
        foe.parries >= 2
          ? "frequently parries incoming attacks"
          : foe.parries
            ? "has parried an attack"
            : "has not parried",
      blockedAttacks: foe.blocks >= 3 ? "frequently blocks" : "rarely blocks",
    },
    habits: history.slice(-6),
  };
}
export async function requestDecision(
  brain,
  state,
  {
    apiBase = "",
    now = () => 0,
    isCurrent = () => true,
    fetchImpl = fetch,
  } = {},
) {
  if (brain.pending) return "busy";
  brain.pending = true;
  brain.lastBrain = now();
  try {
    const response = await fetchImpl(`${apiBase}/api/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw Error("JEV unavailable");
    const result = await response.json();
    if (!isCurrent()) return "stale";
    brain.decision = result;
    brain.decisionAt = now();
    brain.liveCount++;
    brain.failures = 0;
    return "live";
  } catch {
    if (!isCurrent()) return "stale";
    brain.failures++;
    return "failed";
  } finally {
    brain.pending = false;
  }
}
export function liveDecision(brain, now) {
  return brain.decision?.source === "jev" && now - brain.decisionAt < 5
    ? brain.decision
    : null;
}
export function decisionDue(brain, now) {
  return !brain.pending && now - brain.lastBrain > (brain.failures ? 3 : 0.9);
}
export async function requestDecisionPair(brains, states, options = {}) {
  if (brains.some((b) => b.pending)) return "busy";
  const now = options.now || (() => 0);
  const candidates = brains.map((b) => ({ ...b, pending: false }));
  brains.forEach((b) => {
    b.pending = true;
    b.lastBrain = now();
  });
  try {
    const results = await Promise.all(
      candidates.map((b, i) => requestDecision(b, states[i], options)),
    );
    if (options.isCurrent && !options.isCurrent()) return "stale";
    if (results.every((r) => r === "live")) {
      const committedAt = now();
      brains.forEach((b, i) =>
        Object.assign(b, candidates[i], { decisionAt: committedAt }),
      );
      return "live";
    }
    // Keep the last complete pair. A faster response never gets extra policy updates.
    brains.forEach((b, i) => {
      b.failures = candidates[i].failures;
    });
    return "failed";
  } finally {
    brains.forEach((b) => {
      b.pending = false;
    });
  }
}
