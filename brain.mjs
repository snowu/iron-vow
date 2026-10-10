const reactionCriteria = {
  block: "React by guarding the observed sword direction",
  parry: "Commit to a timed parry, risking a feint",
  dodge: "Dodge just before impact, risking a recovery punish",
  interrupt: "Use a fast attack to interrupt; risky against fast strikes",
};
export const questions = {
  on_opening: {
    type: "choice",
    instructions:
      "After this warrior wins a parry or guardbreak, the opponent is briefly staggered. Which follow-up should capitalize on that opening? A light is guaranteed when close and sufficiently rested; a heavy risks missing the short window. Recover when exhausted.",
    criteria: {
      light: "Take the fast guaranteed countercut",
      heavy: "Risk a stronger slower countercut",
      recover: "Use the opening to recover stamina",
    },
  },
  after_feint: {
    type: "choice",
    instructions:
      "After cancelling a heavy to bait defense, choose the next mixup. Guardbreak catches committed parries; a quick light catches dodge recovery; repeating an uncommitted heavy can bait again.",
    criteria: {
      guardbreak: "Grab the baited parry or stationary guard",
      light: "Quick cut from the chosen new direction",
      heavy: "Commit to another powerful cut",
      defend: "Wait to defend the counterattack",
    },
  },
  on_light: {
    type: "choice",
    instructions:
      "If the opponent starts a quick sword cut, how would this warrior react? Consider personality, stamina and habits.",
    criteria: reactionCriteria,
  },
  on_heavy: {
    type: "choice",
    instructions:
      "If the opponent starts a slow heavy sword cut, how would this warrior react? Repeated feints punish parries and dodges.",
    criteria: reactionCriteria,
  },
  on_guardbreak: {
    type: "choice",
    instructions:
      "If the opponent attempts a close guard break, choose this warrior’s response.",
    criteria: {
      counter: "Time a counter guard break",
      dodge: "Dodge out before the grab",
      interrupt: "Interrupt with a quick sword cut",
      accept: "Accept the grab: aggression or poor stamina creates risk",
    },
  },
  tactic: {
    type: "choice",
    instructions:
      "Choose this warrior’s next proactive combat tactic given the situation and personality. Reactive defense is handled separately. Use attacks to punish recovery. Feints are useful against parry-happy opponents but repeated feints alone do not deal damage.",
    criteria: {
      light: "Fast sword cut to pressure or punish recovery",
      heavy: "Slow powerful sword cut; can be feinted",
      guardbreak: "Break a stationary guard at close range",
      feint: "Start a heavy attack then cancel to bait a reaction",
      defend: "Hold guard and wait for an opening",
      dodge: "Evade an incoming strike or regain stamina",
    },
  },
  attack_direction: {
    type: "choice",
    instructions:
      "Choose the next sword attack direction, favouring openings and varying predictable patterns.",
    criteria: {
      left: "Cut from the opponent’s left",
      top: "Overhead cut",
      right: "Cut from the opponent’s right",
    },
  },
  guard_direction: {
    type: "choice",
    instructions:
      "Which direction should this warrior guard? Match a visible incoming attack; otherwise anticipate recent habits.",
    criteria: {
      left: "Guard left",
      top: "Guard overhead",
      right: "Guard right",
    },
  },
  movement: {
    type: "choice",
    instructions:
      "Choose movement relative to the opponent. Stay within reach to attack, recover space when exhausted.",
    criteria: {
      advance: "Close distance",
      retreat: "Create distance",
      circle_left: "Circle left around opponent",
      circle_right: "Circle right around opponent",
      hold: "Hold position",
    },
  },
};
export const personas = {
  warden:
    "A disciplined knight. Patient but decisive. Defends incoming attacks, uses feints against guards, closes distance and punishes recovery.",
  raider:
    "A ferocious raider. Aggressive and unpredictable. Frequently mixes heavy and light cuts, closes distance relentlessly, but dodges when exhausted.",
  duelist:
    "A calculating duelist. Circles the enemy, baits attacks with feints, then punishes. Breaks repetitive guards and manages stamina carefully.",
};
export function sample(distribution, random = Math.random) {
  const entries = Object.entries(distribution ?? {}).filter(
    ([, v]) => Number.isFinite(v) && v > 0,
  );
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (!total) throw Error("Empty probability distribution");
  let r = random() * total;
  for (const [key, v] of entries) {
    r -= v;
    if (r <= 0) return key;
  }
  return entries.at(-1)[0];
}
export function decode(body) {
  const decision = {};
  for (const [key, q] of Object.entries(questions)) {
    const answer = body.answers?.[key];
    if (
      !answer ||
      Object.keys(answer.probabilities ?? {}).some(
        (k) => !Object.hasOwn(q.criteria, k),
      )
    )
      throw Error("Invalid JEV answer");
    decision[key] = sample(answer.probabilities);
  }
  return decision;
}
export async function ask(state, key) {
  if (!key) throw Error("JEV key unavailable");
  const started = performance.now();
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw Error(`JEV HTTP ${response.status}`);
  const body = await response.json();
  return {
    ...decode(body),
    probabilities: Object.fromEntries(
      Object.entries(body.answers).map(([k, v]) => [k, v.probabilities]),
    ),
    latency: Math.round(performance.now() - started),
    model: body.model,
    source: "jev",
    tokens: body.usage?.input_tokens,
  };
}
