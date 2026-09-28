import fs from "node:fs";
import path from "node:path";
import { clients } from "@/lib/whatsapp/clientManager";
import { sessionRepository } from "@/database/repositories/sessionRepository";
import { bus, type GatewayEvent } from "@/lib/whatsapp/eventBus";
import { badRequest, notFound } from "@/types/errors";
import { guessMimetype } from "@/lib/whatsapp/messages";
import { DEFAULT_PACING_PRESET, PRESETS, sendScheduler } from "@/lib/whatsapp/pacing";
import * as queue from "@/lib/redis/messageQueue";
import * as queueWorker from "@/lib/redis/queueWorker";
import { isEnabled as isRedisEnabled, isReady as isRedisReady } from "@/lib/redis/client";

class MiscService {
  private async runtime(sessionId: string) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) throw notFound(`Session "${sessionId}" was not found.`);

    const runtime = await clients.ensure(sessionId);
    if (!runtime.jid) throw badRequest("Session is not paired.");

    return runtime;
  }

  /** Escape hatch: invoke any whatsmeow IPC method by name. */
  async callMethod(sessionId: string, method: string, args: Record<string, unknown>) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) throw notFound(`Session "${sessionId}" was not found.`);

    if (!method?.trim()) throw badRequest("`method` is required.");

    const runtime = await clients.ensure(sessionId);
    return runtime.client.call(method, args ?? {});
  }

  /**
   * Generate a fresh message id without sending.
   *
   * Useful for building replies or scheduling sends that must reference an id
   * before they go out.
   */
  async generateMessageId(sessionId: string) {
    const { client } = await this.runtime(sessionId);
    return { id: await client.generateMessageID() };
  }

  /** Upload a file to WhatsApp's CDN and return the reusable media handle. */
  async uploadMedia(sessionId: string, filePath: string, mediaType: string) {
    const { client } = await this.runtime(sessionId);

    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) throw badRequest(`File not found: ${resolved}`);

    const valid = ["image", "video", "audio", "document"];
    if (!valid.includes(mediaType)) {
      throw badRequest(`\`mediaType\` must be one of: ${valid.join(", ")}.`);
    }

    const result = await client.uploadMedia(
      resolved,
      mediaType as "image" | "video" | "audio" | "document",
    );

    return { ...result, mimetype: guessMimetype(resolved), fileName: path.basename(resolved) };
  }

  /** Decode media referenced by a stored proto message into a local file. */
  async downloadMedia(sessionId: string, message: Record<string, unknown>) {
    const { client } = await this.runtime(sessionId);
    const filePath = await client.downloadAny(message);
    return { path: filePath };
  }

  /** Server-side health probe used by the dashboard header. */
  async getHealth() {
    const sessions = await sessionRepository.getAll();

    return {
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      platform: `${process.platform}-${process.arch}`,
      redis: {
        enabled: isRedisEnabled(),
        available: isRedisReady(),
      },
      sessions: {
        total: sessions.length,
        live: clients.list().length,
        connected: clients.list().filter((runtime) => runtime.status === "connected").length,
      },
    };
  }

  /**
   * Queue depth, counters and in-flight state.
   *
   * Reports `available: false` rather than failing when Redis is unreachable —
   * the endpoint is how the dashboard discovers that Redis is down, so it must
   * stay answerable while Redis is not.
   */
  async getQueueStats() {
    const snapshot = await queue.stats();
    return { ...snapshot, draining: queueWorker.drainingSessions() };
  }

  /** Queued message ids for one session, oldest first. */
  async getSessionQueue(sessionId: string, limit: number) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) throw notFound(`Session "${sessionId}" was not found.`);

    const ids = await queue.listIds(sessionId, limit);
    const entries = await Promise.all(ids.map((id) => queue.peek(id)));

    return {
      sessionId,
      depth: await queue.depth(sessionId),
      entries: entries.filter((entry) => entry !== null),
    };
  }

  /** Drain one session now, instead of waiting for the next trigger. */
  async drainQueue(sessionId: string) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) throw notFound(`Session "${sessionId}" was not found.`);

    return queueWorker.drain(sessionId);
  }

  /**
   * The pacing presets, so the dashboard can offer them without hardcoding a
   * copy that would drift from the server's timing model.
   */
  getPacingOptions() {
    return {
      defaultPreset: DEFAULT_PACING_PRESET,
      activeChats: sendScheduler.size(),
      presets: Object.entries(PRESETS).map(([name, config]) => ({
        name,
        ...config,
      })),
    };
  }

  /**
   * Subscribe to the gateway bus as a Server-Sent Events stream.
   *
   * Implemented by hand rather than with a helper so the reply stays a plain
   * streaming Response, which works identically under Bun and Node.
   */
  streamEvents(c: { req: { raw: Request; query: (key: string) => string | undefined } }) {
    const sessionFilter = c.req.query("sessionId");
    const eventFilter = c.req.query("events")?.split(",").filter(Boolean);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const write = (event: string, data: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            // Client vanished mid-write; cleanup runs in `cancel`/interval.
          }
        };

        write("ready", { at: new Date().toISOString() });

        const unsubscribe = bus.onEvent("*", (payload) => {
          const { event, ...rest } = payload as { event?: string; sessionId?: string };

          if (sessionFilter && rest.sessionId !== sessionFilter) return;
          if (eventFilter && event && !eventFilter.includes(event)) return;

          write(event ?? "message", rest);
        });

        // Comment frames keep intermediaries from closing an idle connection.
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 25_000);

        // Hono has no reliable "connection closed" hook across adapters, so the
        // stream is aborted by the request signal.
        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }
}

export const miscService = new MiscService();
export type { GatewayEvent };
