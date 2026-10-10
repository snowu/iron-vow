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
// Preserve typed choice keys for existing clients; the fencing client maps them
// to thrust/lunge/beat/retreat. No melee tactic reaches the fencing simulation.
export const fencingQuestions = {
  tactic: {
    type: "choice",
    instructions:
      "Choose an épée fencer's proactive intention on a narrow piste. Use the recent observed actions, lines, results and distance in habits to exploit this opponent: feint against repeated parries, beat a presented blade, draw a committed lunge then punish its recovery. Vary a failed plan instead of repeating straight thrusts. Thrust reaches about 2m, lunge about 3m. Prefer a single touch; counterattacking into an extension risks a double. No passive block, slashes, grabs or right-of-way.",
    criteria: {
      light: "Quick straight thrust at close distance",
      heavy: "Committed long lunge",
      guardbreak: "Beat the blade at close range before attacking",
      feint: "False lunge preparation to draw a parry, then cancel",
      defend: "Draw an attack and prepare a parry-riposte",
      dodge: "Fast retreat to make the point fall short",
    },
  },
  attack_direction: {
    type: "choice",
    instructions:
      "Choose an épée blade line using recently observed opponent parry lines in habits. Attack a different line from the opponent's repeated parry. For a compound feint attack this also chooses the line used to disengage around a committed matching parry.",
    criteria: {
      top: "High line toward mask",
      left: "Inside line toward torso",
      right: "Outside line toward torso",
    },
  },
  guard_direction: {
    type: "choice",
    instructions:
      "Choose anticipated parry line; simply holding it does not block. A timed parry must match the observed blade line.",
    criteria: {
      top: "High parry",
      left: "Inside parry",
      right: "Outside parry",
    },
  },
  movement: {
    type: "choice",
    instructions:
      "Choose fencing footwork on a straight piste, no circling. Use exact distance and recent actions in habits. Thrust reach about two metres; lunge reaches about three. Draw a lunge by giving ground, then close for a riposte during recovery. Hold near the edge of reach when baiting instead of always closing to body distance; take space after a retreat or short attack. Retreat when exhausted.",
    criteria: {
      advance: "Advance toward opponent",
      retreat: "Retreat to open distance",
      circle_left: "Small half-step forward",
      circle_right: "Small half-step backward",
      hold: "Hold distance and draw commitment",
    },
  },
  on_light: {
    type: "choice",
    instructions:
      "React to a quick straight thrust. Delayed perception makes a late parry risky. Retreat to avoid by actual distance; counterthrust may produce double touches.",
    criteria: {
      block: "Timed matching parry",
      parry: "Timed matching parry then riposte",
      dodge: "Fast retreat out of point reach",
      interrupt: "Counterthrust; accept double-touch risk",
    },
  },
  on_heavy: {
    type: "choice",
    instructions:
      "React to a committed lunge; its preparatory motion can be feinted. Timed parry-riposte or retreat and punish a short lunge.",
    criteria: {
      block: "Matching parry",
      parry: "Parry then immediate riposte",
      dodge: "Retreat outside lunge reach",
      interrupt: "Counterthrust into preparation",
    },
  },
  on_guardbreak: {
    type: "choice",
    instructions:
      "Respond to a close blade beat, a preparation that displaces your blade but does not itself score.",
    criteria: {
      counter: "Recover blade line",
      dodge: "Retreat outside beat distance",
      interrupt: "Thrust before blade contact",
      accept: "Accept displacement briefly then recover",
    },
  },
  on_opening: {
    type: "choice",
    instructions:
      "Choose how to exploit a successful parry, displaced blade, or opponent's missed attack in recovery. A quick thrust fits a close opening; lunge if the opponent recovered distance. Recover only when tired or outside useful reach. This cached choice executes immediately when an opening is observed, without waiting for another request.",
    criteria: {
      light: "Immediate thrust riposte",
      heavy: "Lunge riposte",
      recover: "Recover footwork and stamina",
    },
  },
  after_feint: {
    type: "choice",
    instructions:
      "Choose the second intention after a false preparation. Against a drawn parry, thrust in another line and disengage around a matching parry. Against a retreat, commit a lunge to catch recovery. Against counterthrusts, draw and parry the counter. A beat prepares the next thrust. Use observed opponent reactions in habits, rather than repeating the same unsuccessful preparation.",
    criteria: {
      guardbreak: "Beat the blade",
      light: "Quick thrust in a different line",
      heavy: "Commit the lunge",
      defend: "Draw and parry the counterthrust",
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
const fencingPersonas = {
  warden:
    "A disciplined épée tactician: measures distance, prepares blade beats and feints, parries then ripostes.",
  raider:
    "An aggressive épée presser: takes piste space, mixes thrusts and committed lunges, manages double-touch risk.",
  duelist:
    "A patient épée counterfencer: draws lunges, retreats to make them short, parries and ripostes decisively.",
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
    body: JSON.stringify({
      model: "jev-latest",
      state:
        state.discipline === "fencing"
          ? { ...state, personality: fencingPersonas[state.persona] }
          : state,
      questions: state.discipline === "fencing" ? fencingQuestions : questions,
    }),
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
