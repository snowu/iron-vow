import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { combatState } from "../worker/index.js";
import { questions, personas } from "../brain.mjs";
const origin = "https://snowu.github.io";
const state = {
  persona: "warden",
  distance: "within sword reach",
  self: {
    health: "high",
    stamina: "high",
    action: "idle",
    guard: "top",
    nearWall: false,
  },
  opponent: {
    health: "high",
    stamina: "moderate",
    action: "heavy",
    guard: "left",
    attackDirection: "left",
    status: "ready",
    parryHabit: "has not parried",
    blockedAttacks: "rarely blocks",
  },
  habits: [],
};
const env = (overrides = {}) => ({
  ALLOWED_ORIGIN: origin,
  TYPESAFE_API_KEY: "test-only-placeholder",
  PLAYER_LIMIT: { limit: async () => ({ success: true }) },
  SERVICE_LIMIT: { limit: async () => ({ success: true }) },
  ...overrides,
});
const request = (
  body = state,
  headers = { Origin: origin, "Content-Type": "application/json" },
) =>
  new Request("https://api.example/api/decision", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
test("Worker returns health without exposing secret values", async () => {
  const response = await worker.fetch(
    new Request("https://api.example/api/health"),
    env(),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).keyConfigured, true);
});
test("CORS permits Pages preflight and rejects unrelated origins", async () => {
  let response = await worker.fetch(
    new Request("https://api.example/api/decision", {
      method: "OPTIONS",
      headers: { Origin: origin },
    }),
    env(),
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  response = await worker.fetch(
    request(state, {
      Origin: "https://unrelated.example",
      "Content-Type": "application/json",
    }),
    env(),
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  response = await worker.fetch(
    request(state, { "Content-Type": "application/json" }),
    env(),
  );
  assert.equal(response.status, 403);
});
test("invalid and oversized state are rejected before calling JEV", async () => {
  for (const [body, status] of [
    ["{", 400],
    [{ ...state, persona: "__proto__" }, 400],
    [{ ...state, self: { ...state.self, action: "execute shell" } }, 400],
    [" ".repeat(8200), 413],
  ]) {
    const response = await worker.fetch(request(body), env());
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  }
  const response = await worker.fetch(
    request(state, { Origin: origin, "Content-Type": "text/plain" }),
    env(),
  );
  assert.equal(response.status, 415);
});
test("server supplies personality and drops arbitrary client fields", () => {
  const parsed = combatState({
    ...state,
    personality: "client override",
    questions: {},
    secret: "arbitrary",
  });
  assert.equal(parsed.personality, personas.warden);
  assert.equal(parsed.secret, undefined);
  assert.equal(parsed.questions, undefined);
});
test("rate limiting stops inference while allowing browser fallback", async () => {
  for (const binding of ["PLAYER_LIMIT", "SERVICE_LIMIT"]) {
    const response = await worker.fetch(
      request(),
      env({ [binding]: { limit: async () => ({ success: false }) } }),
    );
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "3");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  }
});
test("valid state reaches JEV and returns typed probabilities", async (t) => {
  let sent;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    sent = JSON.parse(options.body);
    return Response.json({
      model: "test-model",
      answers: Object.fromEntries(
        Object.entries(questions).map(([k, q]) => [
          k,
          { probabilities: { [Object.keys(q.criteria)[0]]: 1 } },
        ]),
      ),
    });
  });
  const response = await worker.fetch(request(), env());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, "jev");
  assert.equal(Object.keys(result.probabilities).length, 9);
  assert.equal(sent.state.personality, personas.warden);
  assert.ok(!JSON.stringify(result).includes("test-only-placeholder"));
});
test("provider failures are handled without exposing upstream errors", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("sensitive upstream detail");
  });
  const response = await worker.fetch(request(), env());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "JEV temporarily unavailable",
  });
});
