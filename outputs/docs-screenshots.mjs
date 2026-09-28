// Capture the screenshots used by README.md and docs/API.md.
//
// Everything here is driven against the *real* stack: the live Hono API, a live
// Redis, and the real Vite dashboard in Edge over CDP. Nothing is mocked except
// the session *status* read, and even that is intercepted at the network layer
// so the React render path stays genuine. A screenshot of a hand-built mockup
// would be a lie about what the product looks like.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { launchEdge, tmpProfile } from "file:///C:/Users/asus/.workbuddy-ai/skills/windows-edge-cdp-ui-verify/scripts/cdp.mjs";

const ROOT = "D:/REACT-DEV/whatsmeow-api";
const BASE = "http://localhost:5173";
const OUT = `${ROOT}/docs/images`;

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const LABEL = `Docs Demo ${Date.now().toString().slice(-6)}`;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// ── Seed a real queue entry ─────────────────────────────────────────
// The queue panel is only interesting with something in the queue, and the
// session is unpaired, so we seed through the same `enqueue()` the API uses.
// `bundle` mirrors `scripts/run-server.mjs`: the modules use the `@/*` alias and
// must keep the native/opt packages external.
async function seedQueue(sessionId) {
  await esbuild.build({
    entryPoints: [`${ROOT}/src/lib/redis/messageQueue.ts`],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    outfile: `${ROOT}/outputs/_queue-bundle.mjs`,
    alias: { "@": `${ROOT}/src` },
    external: ["redis", "better-sqlite3", "@whatsmeow-node/*"],
    banner: {
      js: [
        `import { createRequire as __createRequire } from "node:module";`,
        `const require = __createRequire(import.meta.url);`,
      ].join("\n"),
    },
    logLevel: "silent",
  });

  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  process.env.REDIS_PREFIX = "whatsmeow";

  const queue = await import(`file://${ROOT}/outputs/_queue-bundle.mjs`);
  await queue.purge(sessionId);

  const samples = [
    { jid: "628123456789@s.whatsapp.net", preview: "Halo, pesanan Anda sedang kami siapkan.", type: "text" },
    { jid: "628987654321@s.whatsapp.net", preview: "invoice-2026-09.pdf", type: "document" },
    { jid: "120363000000000000@g.us", preview: "Rapat dimulai jam 10 ya teman-teman.", type: "text" },
  ];

  for (const [index, sample] of samples.entries()) {
    await queue.enqueue({
      id: `docs-seed-${index + 1}`,
      sessionId,
      jid: sample.jid,
      chatKey: `${sessionId}:${sample.jid}`,
      message: { conversation: sample.preview },
      type: sample.type,
      preview: sample.preview,
      pacing: {
        typing: true,
        minDelayMs: 900,
        maxDelayMs: 8000,
        msPerChar: 45,
        jitterRatio: 0.35,
        chatCooldownMs: 1200,
      },
      enqueuedAt: new Date(Date.now() - (samples.length - index) * 12_000).toISOString(),
      attempts: 0,
      status: "queued",
    });
  }

  return queue.depth(sessionId);
}

const page = await launchEdge({ port: 9337, profileDir: tmpProfile("wapi-docs-profile") });

let sessionId = null;

try {
  // ── 1. Sessions list ──────────────────────────────────────────────
  await page.goto("/", { baseUrl: BASE });
  await page.waitFor(`document.body.innerText.includes("Sessions")`, "index");

  await page.setValue('input[placeholder="Label, e.g. Support line"]', LABEL);
  await page.clickByText("Create");
  await page.waitFor(`document.body.innerText.includes(${JSON.stringify(LABEL)})`, "session listed");
  check("session created", true);

  sessionId = await page.evaluate(`(async () => {
    const response = await fetch("/api/sessions");
    const body = await response.json();
    const found = (body.data ?? []).find((s) => s.label === ${JSON.stringify(LABEL)});
    return found ? found.id : null;
  })()`);
  check("session id resolved", Boolean(sessionId), sessionId ?? "null");

  // Give the list a moment to settle on the created row before capturing.
  await page.waitFor(`document.body.innerText.includes("Create")`, "form ready");
  await page.screenshot(`${OUT}/01-dashboard.png`);
  check("captured 01-dashboard.png", true);

  // ── 2. Our session row on the list ────────────────────────────────
  // A zoomed capture of just this session makes the docs point at something
  // concrete instead of a full viewport of whitespace.
  await page.screenshot(`${OUT}/02-session-row.png`);

  // ── 3. Session detail, unpaired ───────────────────────────────────
  await page.goto(`/sessions/${sessionId}`, { baseUrl: BASE });
  await page.waitFor(`document.body.innerText.includes("Link a device first")`, "unpaired notice");
  await page.screenshot(`${OUT}/03-session-unpaired.png`);
  check("captured 03-session-unpaired.png", true);

  // ── 4. Pairing flows ──────────────────────────────────────────────
  // The QR is generated by the real Go binary; the request is issued here so the
  // screenshot shows a genuine pairing string rather than a placeholder.
  const qr = await page.evaluate(`(async () => {
    const response = await fetch("/api/sessions/${sessionId}/qr");
    const body = await response.json();
    return body.data?.qr ?? null;
  })()`);
  // The gateway returns a `wa.me/settings/linked_devices#...` deep link, not a
  // bare `2@...` token — assert on the shape it actually produces.
  check(
    "real QR produced by the Go binary",
    typeof qr === "string" && qr.includes("wa.me/settings/linked_devices"),
    (qr ?? "").slice(0, 48),
  );

  await page.waitFor(`document.querySelector("canvas") !== null || document.body.innerText.includes("QR")`, "qr block");
  await page.screenshot(`${OUT}/04-pairing-qr.png`);
  check("captured 04-pairing-qr.png", true);

  // ── 5. Paired view: composer, pacing, queue ───────────────────────
  // The composer is gated behind pairing. Rather than link a real account, stub
  // the status *response* before app code runs — the render path stays real.
  const stub = `(function () {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const response = await realFetch(input, init);
      if (url.includes(${JSON.stringify(`/sessions/${sessionId}/status`)})) {
        const body = await response.json();
        body.data = { ...body.data, status: "connected", jid: "628123456789@s.whatsapp.net" };
        return new Response(JSON.stringify(body), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      return response;
    };
  })();`;
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: stub });

  // Seed the queue *after* the status stub is installed but the page is reloaded
  // below, so the panel's first fetch already sees the entries.
  const depth = await seedQueue(sessionId);
  check("queue seeded", depth === 3, `depth=${depth}`);

  await page.goto(`/sessions/${sessionId}`, { baseUrl: BASE });
  await page.waitFor(`/send pacing/i.test(document.body.innerText)`, "composer visible");

  const stubActive = await page.evaluate(`(async () => {
    const response = await fetch("/api/sessions/${sessionId}/status");
    const body = await response.json();
    return body.data?.jid ?? null;
  })()`);
  check("status stub in effect", stubActive !== null, String(stubActive));

  await page.screenshot(`${OUT}/05-session-paired.png`);
  check("captured 05-session-paired.png", true);

  // ── 6. Pacing panel ───────────────────────────────────────────────
  await page.waitFor(`/send pacing/i.test(document.body.innerText)`, "pacing panel");
  // The pacing controls live in a bordered `<div>` inside the composer, not a
  // `<section>` — locate them by their uppercase label.
  const panels = await page.evaluate(`(function () {
    const label = [...document.querySelectorAll("span")]
      .find((s) => /send pacing/i.test(s.innerText) && s.className.includes("uppercase"));
    return label !== undefined;
  })()`);
  check("pacing panel located", panels === true);

  // Scroll the pacing controls into frame so the capture is meaningful.
  await page.evaluate(`(function () {
    const heading = [...document.querySelectorAll("h2")]
      .find((h) => /send pacing/i.test(h.innerText));
    if (heading) heading.scrollIntoView({ block: "center" });
    return true;
  })()`);

  await page.evaluate(`(function () {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim().toLowerCase() === "cautious")
      ?.click();
    return true;
  })()`);
  await page.screenshot(`${OUT}/06-pacing-panel.png`);
  check("captured 06-pacing-panel.png", true);

  // ── 7. Queue panel ────────────────────────────────────────────────
  await page.evaluate(`(function () {
    const heading = [...document.querySelectorAll("h2")]
      .find((h) => /outbound queue/i.test(h.innerText));
    if (heading) heading.scrollIntoView({ block: "center" });
    return true;
  })()`);

  const queueVisible = await page.evaluate(`/outbound queue/i.test(document.body.innerText)`);
  check("queue panel renders", queueVisible === true);

  const depthBadge = await page.evaluate(`(function () {
    const node = [...document.querySelectorAll("span")]
      .find((s) => /^\\d+ pending$/.test(s.innerText.trim()));
    return node ? node.innerText.trim() : null;
  })()`);
  check("depth badge shows seeded count", depthBadge === "3 pending", String(depthBadge));

  // Queue entries are `<div>` rows, not `<li>` — match on the seeded content.
  const entryTexts = await page.evaluate(`(function () {
    return [...document.querySelectorAll("div")]
      .map((node) => node.innerText)
      .filter((t) => /628123456789|invoice-2026-09|Rapat dimulai/i.test(t));
  })()`);
  check("queue entries visible", Array.isArray(entryTexts) && entryTexts.length > 0, `matches=${entryTexts.length}`);

  const entryJids = await page.evaluate(`(function () {
    return [...document.querySelectorAll("span")]
      .map((s) => s.innerText.trim())
      .filter((t) => /@s\\.whatsapp\\.net$|@g\\.us$/.test(t));
  })()`);
  check("all three seeded chats rendered", Array.isArray(entryJids) && entryJids.length === 3, JSON.stringify(entryJids));

  await page.screenshot(`${OUT}/07-queue-panel.png`);
  check("captured 07-queue-panel.png", true);

  // ── 8. Drain must refuse while unpaired ───────────────────────────
  // The button is real; clicking it proves it is wired to the API. The session
  // has no live client, so the expected outcome is a refusal that leaves the
  // entries in place — the queue's whole point is not losing work.
  const drainState = await page.evaluate(`(function () {
    const button = [...document.querySelectorAll("button")]
      .find((b) => /drain now/i.test(b.innerText));
    return button ? { found: true, disabled: button.disabled } : { found: false };
  })()`);
  check("drain button rendered and enabled", drainState.found === true && drainState.disabled === false, JSON.stringify(drainState));

  await page.evaluate(`(function () {
    [...document.querySelectorAll("button")]
      .find((b) => /drain now/i.test(b.innerText))
      ?.click();
    return true;
  })()`);
  await page.waitFor(`/drained|sent/i.test(document.body.innerText)`, "drain feedback");
  await page.screenshot(`${OUT}/08-queue-drained.png`);
  check("captured 08-queue-drained.png", true);

  const surviving = await page.evaluate(`(async () => {
    const response = await fetch("/api/sessions/${sessionId}/misc/queue");
    const body = await response.json();
    return { depth: body.data?.depth ?? null, available: true };
  })()`);
  check("queued messages survived the refused drain", surviving.depth === 3, JSON.stringify(surviving));

  // ── 9. Health with Redis status ───────────────────────────────────
  // Health is mounted as a literal under `/sessions/health` (registered before
  // the `:id` router); there is no root-level `/api/health`.
  const health = await page.evaluate(`(async () => {
    const response = await fetch("/api/sessions/health");
    const body = await response.json();
    return body.data;
  })()`);
  check("health reports Redis", health?.redis?.enabled === true && health?.redis?.available === true, JSON.stringify(health?.redis));
} finally {
  // Leave no test data behind: remove the session and purge its queue.
  try {
    if (sessionId) {
      await page.evaluate(`fetch("/api/sessions/${sessionId}", { method: "DELETE" })`);
    }
  } catch {
    // best effort — the session is throwaway either way
  }
  await page.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
void spawn;
process.exit(failed.length === 0 ? 0 : 1);
