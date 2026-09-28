/**
 * Development/production runner for the API server.
 *
 * Two paths, picked from the runtime that executes this file:
 *
 * - **Bun** — runs `src/server.ts` directly. Bun resolves the `@/*` alias from
 *   `tsconfig.json` and strips the types itself, so there is nothing to build
 *   and `--watch` restarts in milliseconds.
 * - **Node** — cannot execute TypeScript, so esbuild bundles once into
 *   `dist/server` and Node runs the output. Same watch behaviour, one extra
 *   build step.
 *
 * The reason both exist rather than always bundling: the bundle is only needed
 * to paper over Node's lack of a TS loader, and paying for it under Bun would
 * slow the hot path down for no benefit.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This file lives in `scripts/`, so the project root is one level up.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const entry = path.resolve(root, "src/server.ts");
const outfile = path.resolve(root, "dist/server/server.mjs");
const watch = process.argv.includes("--watch");
const buildOnly = process.argv.includes("--build-only");

/** `process.versions.bun` is set by Bun and by nothing else we run on. */
const isBun = typeof process.versions?.bun === "string";

let child = null;

function startServer() {
  // Under Bun the entry point is TypeScript; under Node it is the bundle.
  const args = isBun ? [entry] : [outfile];
  if (watch && isBun) args.unshift("--watch");

  child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
    cwd: root,
  });

  child.on("exit", (code, signal) => {
    // A clean exit during a watch restart is expected; anything else is fatal.
    if (!signal && code !== 0) {
      console.error(`[runner] Server exited with code ${code}`);
    }
  });
}

/**
 * Node-only build. Kept lazy so running under Bun never loads esbuild.
 *
 * `@whatsmeow-node/*` stays external because it resolves a platform-specific
 * native binary at runtime.
 */
async function bundle({ watch: watchMode }) {
  const { build, context } = await import("esbuild");

  const buildOptions = {
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    sourcemap: true,
    external: ["@whatsmeow-node/*"],
    alias: {
      "@": path.resolve(root, "src"),
    },
    // Bundled CJS dependencies (dotenv, etc.) call `require()` at runtime,
    // which does not exist in an ESM output file — unless we put it back.
    banner: {
      js: [
        `import { createRequire as __createRequire } from "node:module";`,
        `const require = __createRequire(import.meta.url);`,
      ].join("\n"),
    },
    logLevel: "info",
  };

  if (!watchMode) {
    await build(buildOptions);
    return null;
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
  return ctx;
}

async function run() {
  // `--build-only` always takes the esbuild path, so `npm run build` emits the
  // same `dist/server` bundle no matter which runtime ran it.
  if (isBun && !buildOnly) {
    // Bun owns the watch loop, so there is nothing for us to rebuild.
    startServer();
    return;
  }

  await bundle({ watch });

  // `--build-only` lets `npm run build` emit the server bundle without
  // starting it, so CI can build everything and then deploy separately.
  if (!watch && !buildOnly) startServer();
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
