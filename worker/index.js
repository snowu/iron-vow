import { ask, personas } from "../brain.mjs";
const actions = [
  "idle",
  "light",
  "heavy",
  "guardbreak",
  "recover",
  "dodge",
  "parry",
];
const dirs = ["left", "top", "right"];
const buckets = ["high", "moderate", "low"];
class ClientError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function choice(value, allowed) {
  if (!allowed.includes(value))
    throw new ClientError(400, "Invalid combat state");
  return value;
}
function fighterState(input, opponent = false) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ClientError(400, "Invalid fighter");
  const state = {
    health: choice(input.health, buckets),
    stamina: choice(input.stamina, buckets),
    action: choice(input.action, actions),
    guard: choice(input.guard, dirs),
  };
  if (opponent) {
    state.attackDirection = choice(input.attackDirection, dirs);
    state.status = choice(input.status, [
      "staggered and vulnerable",
      "recovering from a committed action",
      "ready",
    ]);
    state.parryHabit = choice(input.parryHabit, [
      "frequently parries incoming attacks",
      "has parried an attack",
      "has not parried",
    ]);
    state.blockedAttacks = choice(input.blockedAttacks, [
      "frequently blocks",
      "rarely blocks",
    ]);
  } else {
    if (typeof input.nearWall !== "boolean")
      throw new ClientError(400, "Invalid arena state");
    state.nearWall = input.nearWall;
  }
  return state;
}
export function combatState(input) {
  if (!input || !Object.hasOwn(personas, input.persona))
    throw new ClientError(400, "Invalid persona");
  if (
    !Array.isArray(input.habits) ||
    input.habits.length > 6 ||
    input.habits.some((h) => typeof h !== "string" || h.length > 160)
  )
    throw new ClientError(400, "Invalid combat history");
  return {
    persona: input.persona,
    personality: personas[input.persona],
    distance: choice(input.distance, [
      "within sword reach",
      "outside sword reach",
    ]),
    self: fighterState(input.self),
    opponent: fighterState(input.opponent, true),
    habits: input.habits,
  };
}
async function boundedJson(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ClientError(415, "Expected JSON");
  if (Number(request.headers.get("content-length")) > 8192)
    throw new ClientError(413, "State too large");
  if (!request.body) throw new ClientError(400, "Missing state");
  const reader = request.body.getReader(),
    chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 8192) {
      await reader.cancel();
      throw new ClientError(413, "State too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ClientError(400, "Invalid JSON");
  }
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const origin = request.headers.get("Origin");
    const allowed = origin === env.ALLOWED_ORIGIN;
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    };
    if (allowed) headers["Access-Control-Allow-Origin"] = origin;
    const json = (body, status = 200, extra = {}) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, ...extra },
      });
    if (origin && !allowed) return json({ error: "Origin not allowed" }, 403);
    if (!["/api/health", "/api/decision"].includes(path))
      return json({ error: "Not found" }, 404);
    if (request.method === "OPTIONS") {
      if (!allowed) return json({ error: "Origin required" }, 403);
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
        },
      });
    }
    if (path === "/api/health") {
      if (request.method !== "GET")
        return json({ error: "Method not allowed" }, 405, {
          Allow: "GET, OPTIONS",
        });
      return json({
        service: "Iron Vow",
        production: true,
        keyConfigured: !!env.TYPESAFE_API_KEY,
        backend: "cloudflare-workers",
      });
    }
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405, {
        Allow: "POST, OPTIONS",
      });
    if (!allowed) return json({ error: "Origin required" }, 403);
    try {
      const state = combatState(await boundedJson(request));
      if (!env.TYPESAFE_API_KEY)
        return json({ error: "JEV is not configured" }, 503);
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const player = await env.PLAYER_LIMIT.limit({ key: ip });
      if (!player.success)
        return json({ error: "Decision rate limit reached" }, 429, {
          "Retry-After": "3",
        });
      const service = await env.SERVICE_LIMIT.limit({ key: "jev-decisions" });
      if (!service.success)
        return json({ error: "Decision service busy" }, 429, {
          "Retry-After": "3",
        });
      const decision = await ask(state, env.TYPESAFE_API_KEY);
      console.log(
        JSON.stringify({
          event: "jev_decision",
          model: decision.model,
          latency: decision.latency,
          persona: state.persona,
        }),
      );
      return json(decision);
    } catch (error) {
      if (error instanceof ClientError)
        return json({ error: error.message }, error.status);
      // Do not return provider errors or request bodies to the browser or logs.
      console.error(JSON.stringify({ event: "jev_unavailable" }));
      return json({ error: "JEV temporarily unavailable" }, 503);
    }
  },
};
