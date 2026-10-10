import { ask } from "./brain.mjs";
const state = {
  persona: "warden",
  distance: "within sword reach",
  self: { health: "healthy", stamina: "full", action: "idle" },
  opponent: {
    health: "wounded",
    stamina: "low",
    action: "heavy attack windup",
    attackDirection: "top",
    guard: "left",
  },
  habits: ["opponent repeatedly guards left"],
};
const result = await ask(state, process.env.TYPESAFE_API_KEY);
console.log(JSON.stringify(result, null, 2));
