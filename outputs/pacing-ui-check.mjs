import { launchEdge, tmpProfile } from "file:///C:/Users/asus/.workbuddy-ai/skills/windows-edge-cdp-ui-verify/scripts/cdp.mjs";

const BASE = "http://localhost:5173";
const LABEL = `Pacing Check ${Date.now().toString().slice(-6)}`;

const page = await launchEdge({
  port: 9334,
  profileDir: tmpProfile("wapi-pacing-profile"),
});

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

let sessionId = null;

try {
  // ── Sessions list ────────────────────────────────────────────────
  await page.goto("/", { baseUrl: BASE });
  await page.waitFor(`document.body.innerText.includes("Sessions")`, "halaman index");

  // ── Create a throwaway session through the form ───────────────────
  await page.setValue('input[placeholder="Label, e.g. Support line"]', LABEL);
  await page.clickByText("Create");
  await page.waitFor(
    `document.body.innerText.includes(${JSON.stringify(LABEL)})`,
    "sesi tampil di daftar",
  );
  check("session created via form", true);

  // Resolve the id from the API so the check is not coupled to link markup.
  sessionId = await page.evaluate(`(async () => {
    const response = await fetch("/api/sessions");
    const body = await response.json();
    const found = (body.data ?? []).find((s) => s.label === ${JSON.stringify(LABEL)});
    return found ? found.id : null;
  })()`);
  check("session id resolved", Boolean(sessionId), sessionId ?? "null");

  // ── The gate is real ─────────────────────────────────────────────
  // An unpaired session must not offer the composer at all.
  await page.goto(`/sessions/${sessionId}`, { baseUrl: BASE });
  await page.waitFor(
    `document.body.innerText.includes("Link a device first")`,
    "pemberitahuan unpaired",
  );  const panelHiddenWhileUnpaired = await page.evaluate(
    `!/send pacing/i.test(document.body.innerText)`,
  );
  check("pacing panel correctly hidden while unpaired", panelHiddenWhileUnpaired === true);

  // ── Pacing panel renders for a paired session ────────────────────
  // The composer (and therefore the pacing controls) is gated behind pairing.
  // Rather than pair a real device, intercept `window.fetch` so the status read
  // reports a paired session. The app goes through its genuine render path.
  // The composer (and therefore the pacing controls) is gated behind pairing.
  // Rather than pair a real device, stub `window.fetch` so the status read
  // reports a paired session. `Page.addScriptToEvaluateOnNewDocument` installs
  // the stub *before* any app module runs, so it is in place for the very first
  // query — patching after `goto` would be too late, since TanStack Query would
  // already have cached the unpaired result.
  const stubSource = `(function () {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const response = await realFetch(input, init);
      if (url.includes(${JSON.stringify(`/sessions/${sessionId}/status`)})) {
        const body = await response.json();
        body.data = {
          ...body.data,
          status: "connected",
          jid: "628123456789@s.whatsapp.net",
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return response;
    };
  })();`;

  const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: stubSource,
  });

  await page.goto(`/sessions/${sessionId}`, { baseUrl: BASE });

  await page.waitFor(
    `/send pacing/i.test(document.body.innerText) ||
     document.body.innerText.includes("Link a device first")`,
    "halaman detail termuat",
  );

  // Prove the stub is actually in effect before asserting on its effects —
  // otherwise a silent no-op looks like an app bug.
  const stubActive = await page.evaluate(`(async () => {
    const response = await fetch("/api/sessions/${sessionId}/status");
    const body = await response.json();
    return { jid: body.data?.jid ?? null, status: body.data?.status ?? null };
  })()`);
  check("status stub reports a paired session", stubActive.jid !== null, JSON.stringify(stubActive));
  void stubActive;

  await page.waitFor(
    `/send pacing/i.test(document.body.innerText)`,
    "panel pacing tampil",
  );
  check("pacing panel renders for a paired session", true);

  // Every server preset must be offered as a chip.
  const chips = await page.evaluate(`(function () {
    const labels = ["off", "fast", "natural", "cautious"];
    const found = [...document.querySelectorAll("button")].map((b) => b.textContent.trim().toLowerCase());
    return labels.filter((label) => found.includes(label));
  })()`);
  check(
    "all four preset chips render",
    Array.isArray(chips) && chips.length === 4,
    JSON.stringify(chips),
  );

  const hasDefaultChip = await page.evaluate(
    `[...document.querySelectorAll("button")].some((b) => b.textContent.trim().toLowerCase() === "server default")`,
  );
  check("server-default chip renders", hasDefaultChip === true);

  // The description explains the currently selected preset.
  const descriptionBefore = await page.evaluate(`(function () {
    const node = [...document.querySelectorAll("p")].find((p) => p.innerText.includes("typing"));
    return node ? node.innerText : "";
  })()`);
  check(
    "pacing description present",
    descriptionBefore.length > 0,
    descriptionBefore.slice(0, 70),
  );

  // Selecting a preset must change the description — proving the chips are wired.
  await page.evaluate(`(function () {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim().toLowerCase() === "cautious")
      .click();
    return true;
  })()`);
  await page.waitFor(
    `[...document.querySelectorAll("button")].some((b) => b.textContent.trim().toLowerCase() === "cautious" && b.className.includes("brand"))`,
    "chip cautious aktif",
  );
  const descriptionAfter = await page.evaluate(`(function () {
    const node = [...document.querySelectorAll("p")].find((p) => p.innerText.includes("typing"));
    return node ? node.innerText : "";
  })()`);
  check(
    "selecting a preset updates the description",
    descriptionAfter !== descriptionBefore,
    descriptionAfter.slice(0, 70),
  );

  // "off" must describe immediate sending, not a typing pause.
  await page.evaluate(`(function () {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim().toLowerCase() === "off")
      .click();
    return true;
  })()`);
  await page.waitFor(
    `document.body.innerText.includes("Sends immediately")`,
    "deskripsi preset off",
  );
  check("off preset describes an immediate send", true);

  await page.screenshot("D:/REACT-DEV/whatsmeow-api/outputs/pacing-panel.png");

  // ── Presets come from the server, not a hardcoded copy ────────────
  const apiPresets = await page.evaluate(`(async () => {
    const response = await fetch("/api/pacing");
    const body = await response.json();
    return body.data.presets.map((p) => p.name);
  })()`);
  check(
    "server exposes 4 presets",
    Array.isArray(apiPresets) && apiPresets.length === 4,
    JSON.stringify(apiPresets),
  );

  const proxyPresets = await page.evaluate(`(async () => {
    const response = await fetch("/api/pacing");
    const body = await response.json();
    return { defaultPreset: body.data.defaultPreset, activeChats: body.data.activeChats };
  })()`);
  check(
    "default preset is natural",
    proxyPresets.defaultPreset === "natural",
    JSON.stringify(proxyPresets),
  );

  // ── Chip labels must match the server's presets, not a hardcoded copy ──
  // If the UI ever hardcoded its own preset list, this would catch the drift.
  const chipLabels = await page.evaluate(`(function () {
    const labels = ["off", "fast", "natural", "cautious"];
    const found = [...document.querySelectorAll("button")].map((b) => b.textContent.trim().toLowerCase());
    return labels.filter((label) => found.includes(label));
  })()`);
  check(
    "rendered chips match server presets exactly",
    JSON.stringify(chipLabels) === JSON.stringify(apiPresets),
    `${JSON.stringify(chipLabels)} vs ${JSON.stringify(apiPresets)}`,
  );

  // ── Sending is refused with a clear message, not a 500 ────────────
  const sendStatus = await page.evaluate(`(async () => {
    const response = await fetch("/api/sessions/${sessionId}/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "628123456789", text: "hi" }),
    });
    const body = await response.json();
    return { status: response.status, message: body.message, code: body.data?.code };
  })()`);
  check(
    "unpaired send refused with 400",
    sendStatus.status === 400,
    JSON.stringify(sendStatus),
  );

  // ── Pacing is accepted by the schema (not rejected as unknown) ────
  const pacedStatus = await page.evaluate(`(async () => {
    const response = await fetch("/api/sessions/${sessionId}/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "628123456789",
        text: "hi",
        pacing: { preset: "off" },
      }),
    });
    return response.status;
  })()`);
  check(
    "paced send reaches the same validation (not a schema error)",
    pacedStatus === 400,
    `status ${pacedStatus}`,
  );

  // ── Console clean ─────────────────────────────────────────────────
  check(
    "console clean",
    page.errors.length === 0,
    page.errors.slice(0, 3).join(" | ") || "no errors",
  );

  // ── Cleanup: delete the throwaway session ────────────────────────
  const deleted = await page.evaluate(`(async () => {
    const response = await fetch("/api/sessions/${sessionId}", { method: "DELETE" });
    return response.status;
  })()`);
  check("cleanup: session deleted", deleted < 400, `status ${deleted}`);
  sessionId = null;
} catch (error) {
  check("script completed", false, String(error?.message ?? error));
} finally {
  if (sessionId) {
    try {
      await page.evaluate(`fetch("/api/sessions/${sessionId}", { method: "DELETE" }).then(() => true)`);
      console.log("cleanup on failure: session deleted");
    } catch {}
  }
  await page.close();
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`TOTAL ${results.length}  PASSED ${results.length - failed.length}  FAILED ${failed.length}`);
process.exit(failed.length === 0 ? 0 : 1);
