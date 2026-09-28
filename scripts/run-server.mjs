/**
 * Development/production runner for the API server.
 *
 * Why this exists: the server uses the same `@/*` path alias as the client, and
 * it imports TypeScript directly. Plain `node src/server.ts` cannot resolve
 * either, and Bun's N-API layer crashes on `better-sqlite3` on this machine.
 * esbuild bundles once into `dist/server` and Node runs the output — a plain
 * file with no alias resolution left to do at runtime.
 *
 * Watch mode rebuilds on change and restarts the child process.
 */
import { spawn } from "node:child_process";
import { build, context } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This file lives in `scripts/`, so the project root is one level up.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const entry = path.resolve(root, "src/server.ts");
const outfile = path.resolve(root, "dist/server/server.mjs");
const watch = process.argv.includes("--watch");
const buildOnly = process.argv.includes("--build-only");

/** `better-sqlite3` is a native addon — it must stay external. */
const buildOptions = {
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  external: ["better-sqlite3", "@whatsmeow-node/*"],
  alias: {
    "@": path.resolve(root, "src"),
  },
  // `import.meta.dirname` and friends are preserved by Node, not shimmed.
  banner: {
    js: [
      `import { createRequire as __createRequire } from "node:module";`,
      `const require = __createRequire(import.meta.url);`,
    ].join("\n"),
  },
  logLevel: "info",
};

let child = null;

function startServer() {
  child = spawn(process.execPath, [outfile], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    // A clean exit during a watch restart is expected; anything else is fatal.
    if (!signal && code !== 0) {
      console.error(`[runner] Server exited with code ${code}`);
    }
  });
}

async function run() {
  if (!watch) {
    await build(buildOptions);
    // `--build-only` lets `npm run build` emit the server bundle without
    // starting it, so CI can build everything and then deploy separately.
    if (!buildOnly) startServer();
    return;
  }

  const ctx = await context({
    ...buildOptions,
    plugins: [
      {
        name: "restart-server",
        setup(pluginBuild) {
          pluginBuild.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error("[runner] Build failed — keeping the previous process alive.");
              return;
            }

            if (child) {
              console.log("[runner] Change detected, restarting server…");
              child.removeAllListeners("exit");
              child.kill();
            }
            startServer();
          });
        },
      },
    ],
  });

  await ctx.watch();
  console.log("[runner] Watching for changes…");
}

const shutdown = () => {
  if (child) child.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

run().catch((error) => {
  console.error("[runner] Fatal:", error);
  process.exit(1);
});
