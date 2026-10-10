import http from "node:http";
import { createServer } from "vite";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { ask, personas } from "./brain.mjs";
const port = Number(
  process.argv.find((a) => a.startsWith("--port="))?.split("=")[1] ||
    process.env.PORT ||
    4318,
);
const production = process.argv.includes("--production");
const vite = production
  ? null
  : await createServer({ server: { middlewareMode: true }, appType: "spa" });
const root = resolve("dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
let active = 0,
  last = 0;
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        keyConfigured: !!process.env.TYPESAFE_API_KEY,
        service: "Iron Vow",
        production,
      }),
    );
    return;
  }
  if (req.url === "/api/decision" && req.method === "POST") {
    res.setHeader("Content-Type", "application/json");
    if (active >= 2 || Date.now() - last < 200) {
      res.writeHead(429);
      res.end(JSON.stringify({ error: "Decision already pending" }));
      return;
    }
    let raw = "";
    let counted = false;
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 10000) throw Error("State too large");
      }
      const state = JSON.parse(raw);
      if (!personas[state.persona]) throw Error("Invalid persona");
      active++;
      counted = true;
      last = Date.now();
      const decision = await ask(
        { ...state, personality: personas[state.persona] },
        process.env.TYPESAFE_API_KEY,
      );
      res.end(JSON.stringify(decision));
    } catch (e) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: e.message }));
    } finally {
      if (counted) active--;
    }
    return;
  }
  if (vite) {
    vite.middlewares(req, res, () => {
      res.writeHead(404);
      res.end();
    });
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!file.startsWith(root + sep)) throw Error("Invalid path");
    const info = await stat(file);
    if (!info.isFile()) throw Error("Not a file");
    res.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    res.setHeader("Content-Length", info.size);
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Iron Vow ready at http://localhost:${port} (${production ? "built game" : "development"})`,
  ),
);
function close() {
  server.close();
  vite?.close();
  process.exit();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
