import { randomUUID } from "node:crypto";
import { sessionRepository } from "@/database/repositories/sessionRepository";
import { clients } from "@/lib/whatsapp/clientManager";
import { bus } from "@/lib/whatsapp/eventBus";
import { badRequest, conflict, notFound } from "@/types/errors";
import type { SessionStatus, SessionView } from "@/types/apiResponse";
import type { Session } from "@/database/schema";

class SessionService {
  /** Merge the persisted row with the live runtime, live state winning. */
  private toView(session: Session): SessionView {
    const runtime = clients.get(session.id);

    return {
      id: session.id,
      label: session.label,
      phoneNumber: session.phoneNumber,
      jid: runtime?.jid ?? session.jid,
      pushName: session.pushName,
      status: (runtime?.status ?? (session.status as SessionStatus)) as SessionStatus,
      lastError: runtime?.lastError ?? session.lastError,
      createdAt: toIso(session.createdAt),
      updatedAt: toIso(session.updatedAt),
      connectedAt: session.connectedAt ? toIso(session.connectedAt) : null,
    };
  }

  /**
   * Create a session record and boot its WhatsApp client.
   *
   * `label` is what the dashboard shows; the id is generated so callers never
   * have to invent a filesystem-safe name.
   */
  async create(input: { label?: string; phoneNumber?: string }) {
    const id = randomUUID();
    const now = new Date();

    const session = await sessionRepository.add({
      id,
      label: input.label?.trim() || `Session ${id.slice(0, 8)}`,
      phoneNumber: input.phoneNumber?.replace(/[^\d]/g, "") || null,
      status: "creating",
      createdAt: now,
      updatedAt: now,
    });

    const runtime = await clients.ensure(id);

    // Persist the outcome of the boot so a restart can render something useful.
    const updated = await sessionRepository.update(id, {
      status: runtime.status,
      jid: runtime.jid,
    });

    this.persistStatusWatch(id);
    return this.toView(updated ?? session);
  }

  async getAll() {
    const rows = await sessionRepository.getAll();
    return rows.map((row) => this.toView(row));
  }

  async getById(id: string) {
    const session = await sessionRepository.findById(id);
    if (!session) throw notFound(`Session "${id}" was not found.`);
    return this.toView(session);
  }

  /** Current status plus the live QR / pairing code, if any. */
  async getStatus(id: string) {
    const view = await this.getById(id);
    const runtime = clients.get(id);

    return {
      ...view,
      qr: runtime?.qr?.code ?? null,
      qrReceivedAt: runtime?.qr?.receivedAt ?? null,
      pairCode: runtime?.pairCode?.code ?? null,
      pairCodeIssuedAt: runtime?.pairCode ? new Date(runtime.pairCode.issuedAt).toISOString() : null,
      isConnected: runtime?.status === "connected",
      hasClient: Boolean(runtime),
    };
  }

  /**
   * Latest QR code for a session, starting the client if needed.
   *
   * whatsmeow emits codes continuously while unpaired, so in the common case
   * this resolves instantly from the last event. If nothing has arrived yet we
   * wait briefly on the bus rather than returning null and forcing a poll.
   */
  async getQr(id: string, timeoutMs = 10_000) {
    const session = await sessionRepository.findById(id);
    if (!session) throw notFound(`Session "${id}" was not found.`);

    const runtime = await clients.ensure(id);

    if (runtime.jid) {
      throw conflict(`Session "${id}" is already paired as ${runtime.jid}.`);
    }
    if (runtime.qr) {
      return { qr: runtime.qr.code, receivedAt: runtime.qr.receivedAt };
    }

    const code = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        off();
        resolve(null);
      }, timeoutMs);

      const off = bus.onEvent("session:qr", (payload) => {
        if (payload.sessionId !== id) return;
        clearTimeout(timer);
        off();
        resolve((payload.code as string | null) ?? null);
      });
    });

    if (!code) {
      throw badRequest(
        "No QR code was produced in time. The session may already be paired, or the WhatsApp connection failed.",
      );
    }

    return { qr: code, receivedAt: new Date().toISOString() };
  }

  /** Request an 8-character pairing code for a phone number. */
  async requestPairCode(id: string, phoneNumber: string) {
    const session = await sessionRepository.findById(id);
    if (!session) throw notFound(`Session "${id}" was not found.`);

    const code = await clients.requestPairCode(id, phoneNumber);

    await sessionRepository.update(id, {
      phoneNumber: phoneNumber.replace(/[^\d]/g, ""),
      status: "pairing",
    });

    return { pairCode: code, phoneNumber: phoneNumber.replace(/[^\d]/g, "") };
  }

  /** Force a reconnect. whatsmeow reconnects on its own; this is the manual nudge. */
  async connect(id: string) {
    const session = await sessionRepository.findById(id);
    if (!session) throw notFound(`Session "${id}" was not found.`);

    const runtime = await clients.ensure(id);
    await runtime.client.connect();

    return this.getStatus(id);
  }

  async disconnect(id: string) {
    const session = await sessionRepository.findById(id);
    if (!session) throw notFound(`Session "${id}" was not found.`);

    const runtime = clients.get(id);
    if (!runtime) {
      throw badRequest("This session has no running client to disconnect.");
    }

    await runtime.client.disconnect();
    return this.getStatus(id);
  }

  /**
   * Unlink the device.
   *
   * whatsmeow's logout tells WhatsApp to drop the link, which invalidates the
   * store — the session must be re-paired afterwards.
   */
  async logout(id: string) {
    const session = await sessionRepository.findById(id);
    if (!session) throw notFound(`Session "${id}" was not found.`);

    const runtime = clients.get(id);
    if (runtime) {
      try {
        await runtime.client.logout();
      } finally {
        await clients.destroy(id);
      }
    }

    clients.removeStore(id);
    const updated = await sessionRepository.update(id, {
      status: "logged_out",
      jid: null,
      connectedAt: null,
    });

    return this.toView(updated ?? session);
  }

  async remove(id: string) {
    const session = await sessionRepository.findById(id);
    if (!session) throw notFound(`Session "${id}" was not found.`);

    await clients.destroy(id);
    clients.removeStore(id);
    await sessionRepository.remove(id);

    return { id, removed: true };
  }

  /**
   * Mirror runtime status changes into the database.
   *
   * Registered once per session so the dashboard shows the right state after a
   * server restart, when no client has been re-created yet.
   */
  private persistStatusWatch(sessionId: string) {
    if (this.watched.has(sessionId)) return;
    this.watched.add(sessionId);

    bus.onEvent(["session:status", "session:connected", "session:logged-out"], (payload) => {
      if (payload.sessionId !== sessionId) return;

      const patch: Record<string, unknown> = {};
      if (typeof payload.status === "string") patch.status = payload.status;
      if (typeof payload.jid === "string") patch.jid = payload.jid;
      if (typeof payload.lastError === "string") patch.lastError = payload.lastError;

      if (Object.keys(patch).length === 0) return;

      if (patch.status === "connected") {
        patch.connectedAt = new Date();
        patch.lastError = null;
      }

      // Fire-and-forget: a failed bookkeeping write must not break the request
      // path that triggered it.
      void sessionRepository.update(sessionId, patch).catch(() => undefined);
    });
  }

  private watched = new Set<string>();
}

function toIso(value: Date | number): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export const sessionService = new SessionService();
