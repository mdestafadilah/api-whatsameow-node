import fs from "node:fs";
import path from "node:path";
import { createClient, type WhatsmeowClient, type WhatsmeowEvents } from "@whatsmeow-node/whatsmeow-node";
import { env } from "@/env";
import type { SessionStatus } from "@/types/apiResponse";
import { badRequest, conflict } from "@/types/errors";
import { bus } from "./eventBus";

/** Live, in-memory view of one session. */
export type SessionRuntime = {
  id: string;
  client: WhatsmeowClient;
  status: SessionStatus;
  jid: string | null;
  qr: { code: string; receivedAt: string } | null;
  pairCode: { code: string; phone: string; issuedAt: number } | null;
  starting: Promise<void> | null;
  lastError: string | null;
};

/**
 * Owns every WhatsApp client in the process.
 *
 * whatsmeow-node spawns one Go subprocess per `createClient()`, so this map is
 * effectively a process registry — `size` is bounded by how many accounts you
 * want to run at once. Sessions are lazily started on first use and torn down
 * on delete, keeping boot time flat regardless of how many accounts exist.
 */
class ClientManager {
  private runtimes = new Map<string, SessionRuntime>();

  storePathFor(sessionId: string): string {
    return path.join(env.sessionDir, `${sessionId}.db`);
  }

  has(sessionId: string): boolean {
    return this.runtimes.has(sessionId);
  }

  get(sessionId: string): SessionRuntime | undefined {
    return this.runtimes.get(sessionId);
  }

  list(): SessionRuntime[] {
    return [...this.runtimes.values()];
  }

  /**
   * Start (or return) the runtime for a session.
   *
   * Idempotent and race-safe: concurrent callers awaiting the same session
   * share one `starting` promise, so a double-click in the dashboard cannot
   * spawn two Go binaries fighting over the same SQLite store.
   */
  async ensure(sessionId: string): Promise<SessionRuntime> {
    const existing = this.runtimes.get(sessionId);
    if (existing) {
      if (existing.starting) await existing.starting;
      return existing;
    }

    fs.mkdirSync(env.sessionDir, { recursive: true });

    const client = createClient({
      store: `file:${this.storePathFor(sessionId)}`,
      commandTimeout: env.whatsmeowCommandTimeout,
    });

    const runtime: SessionRuntime = {
      id: sessionId,
      client,
      status: "creating",
      jid: null,
      qr: null,
      pairCode: null,
      starting: null,
      lastError: null,
    };

    this.runtimes.set(sessionId, runtime);
    this.attachListeners(runtime);

    runtime.starting = this.start(runtime);
    try {
      await runtime.starting;
    } finally {
      runtime.starting = null;
    }

    return runtime;
  }

  private async start(runtime: SessionRuntime): Promise<void> {
    const { client } = runtime;
    try {
      const { jid } = await client.init();

      if (jid) {
        // Already paired on disk — go straight to connecting.
        runtime.jid = jid;
        this.setStatus(runtime, "disconnected");
        await client.connect();
        return;
      }

      // Fresh store: the QR channel must be registered *before* connect(), or
      // whatsmeow emits the first code to nobody.
      await client.getQRChannel();
      this.setStatus(runtime, "pairing");
      await client.connect();
    } catch (error) {
      this.setStatus(runtime, "error", describeError(error));
      throw error;
    }
  }

  private attachListeners(runtime: SessionRuntime): void {
    const { client, id } = runtime;

    // ── Pairing ─────────────────────────────────────
    client.on("qr", ({ code }) => {
      runtime.qr = { code, receivedAt: new Date().toISOString() };
      this.setStatus(runtime, "pairing");
      bus.emitEvent("session:qr", { sessionId: id, code, qr: code });
    });

    client.on("qr:timeout", () => {
      runtime.qr = null;
      bus.emitEvent("session:qr", { sessionId: id, code: null, expired: true });
    });

    client.on("qr:error", ({ event }) => {
      bus.emitEvent("session:error", {
        sessionId: id,
        message: `QR channel error: ${event}`,
      });
    });

    // ── Connection lifecycle ────────────────────────
    client.on("connected", ({ jid }) => {
      runtime.jid = jid;
      runtime.qr = null;
      runtime.pairCode = null;
      runtime.lastError = null;
      this.setStatus(runtime, "connected");
      bus.emitEvent("session:connected", { sessionId: id, jid });
    });

    client.on("disconnected", () => {
      // whatsmeow auto-reconnects; surface the blip but don't tear down.
      if (runtime.status !== "logged_out" && runtime.status !== "error") {
        this.setStatus(runtime, "disconnected");
      }
      bus.emitEvent("session:disconnected", { sessionId: id });
    });

    client.on("logged_out", ({ reason }) => {
      runtime.qr = null;
      runtime.pairCode = null;
      runtime.jid = null;
      this.setStatus(runtime, "logged_out", reason);
      bus.emitEvent("session:logged-out", { sessionId: id, reason });
    });

    client.on("stream_error", ({ code }) => {
      bus.emitEvent("session:error", { sessionId: id, message: `Stream error: ${code}` });
    });

    client.on("temporary_ban", ({ code, expire }) => {
      bus.emitEvent("session:error", {
        sessionId: id,
        message: `Temporary ban (${code}), expires ${expire}`,
        temporaryBan: true,
      });
    });

    client.on("keep_alive_timeout", ({ errorCount }) => {
      bus.emitEvent("session:error", {
        sessionId: id,
        message: `Keep-alive failing (${errorCount} missed)`,
        degraded: true,
      });
    });

    // ── Traffic ─────────────────────────────────────
    client.on("message", ({ info, message }) => {
      bus.emitEvent("message", {
        sessionId: id,
        info: info as unknown as Record<string, unknown>,
        message,
        direction: info.isFromMe ? "outgoing" : "incoming",
      });
    });

    client.on("message:receipt", (receipt) => {
      bus.emitEvent("message:receipt", {
        sessionId: id,
        ...(receipt as unknown as Record<string, unknown>),
      });
    });

    client.on("chat_presence", (payload) => {
      bus.emitEvent("presence", {
        sessionId: id,
        ...(payload as unknown as Record<string, unknown>),
      });
    });

    client.on("presence", (payload) => {
      bus.emitEvent("presence", {
        sessionId: id,
        ...(payload as unknown as Record<string, unknown>),
      });
    });

    client.on("call:offer", ({ from, callId }) => {
      bus.emitEvent("call", { sessionId: id, type: "offer", from, callId });
    });

    // ── Failures ────────────────────────────────────
    client.on("error", (error) => {
      const message = describeError(error);
      runtime.lastError = message;
      bus.emitEvent("session:error", { sessionId: id, message });
    });

    client.on("exit", ({ code }) => {
      // The Go binary died — the session is unusable until ensure() runs again.
      runtime.status = "error";
      runtime.lastError = `whatsmeow process exited with code ${code}`;
      this.runtimes.delete(id);
      bus.emitEvent("session:error", {
        sessionId: id,
        message: runtime.lastError,
        processExited: true,
      });
    });
  }

  private setStatus(runtime: SessionRuntime, status: SessionStatus, error?: string | null): void {
    runtime.status = status;
    if (error !== undefined) runtime.lastError = error;
    bus.emitEvent("session:status", {
      sessionId: runtime.id,
      status,
      jid: runtime.jid,
      lastError: runtime.lastError,
    });
  }

  /** Request a pairing code. Requires an active connection and an unpaired store. */
  async requestPairCode(sessionId: string, phone: string): Promise<string> {
    const runtime = await this.ensure(sessionId);

    if (runtime.jid) {
      throw conflict(`Session ${sessionId} is already paired as ${runtime.jid}.`);
    }

    const clean = phone.replace(/[^\d]/g, "");
    if (clean.length < 7) {
      throw badRequest("Phone number must include a country code, e.g. 628123456789.");
    }

    // pairCode() needs the socket up; connect() is a no-op if already connected.
    await runtime.client.connect();
    await runtime.client.waitForConnection(env.whatsmeowCommandTimeout);

    const code = await runtime.client.pairCode(clean);
    runtime.pairCode = { code, phone: clean, issuedAt: Date.now() };
    runtime.status = "pairing";

    bus.emitEvent("session:pair-code", { sessionId, code, phone: clean });
    return code;
  }

  /** Tear down the Go subprocess and forget the runtime. */
  async destroy(sessionId: string): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return;

    try {
      await Promise.race([
        runtime.client.disconnect(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // Disconnect is best-effort; close() below is the real teardown.
    }

    runtime.client.close();
    runtime.client.removeAllListeners();
    this.runtimes.delete(sessionId);
  }

  /** Called on process shutdown so no orphaned Go binaries are left behind. */
  async destroyAll(): Promise<void> {
    await Promise.allSettled([...this.runtimes.keys()].map((id) => this.destroy(id)));
  }

  /** Remove the on-disk store so the number can be paired again from scratch. */
  removeStore(sessionId: string): void {
    const storePath = this.storePathFor(sessionId);
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        fs.rmSync(`${storePath}${suffix}`, { force: true });
      } catch {
        // A missing/locked file is not fatal — the store is gone either way.
      }
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export const clients = new ClientManager();
export type { WhatsmeowEvents, WhatsmeowClient };
