// Node --env-file loads the existing key; transfer directly to Wrangler stdin.
import { spawn } from "node:child_process";
const key = process.env.TYPESAFE_API_KEY;
if (!key) throw Error("TYPESAFE_API_KEY is not configured");
const child = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "secret",
    "put",
    "TYPESAFE_API_KEY",
    "--config",
    "wrangler.jsonc",
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
child.stdin.end(key + "\n");
child.on("error", () => {
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
