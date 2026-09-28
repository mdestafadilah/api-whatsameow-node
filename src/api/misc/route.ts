import { Hono } from "hono";
import { miscController } from "./controller";

const miscRoute = new Hono();

miscRoute.get("/health", miscController.getHealth);

// Global send-pacing presets — not session-scoped, so it lives outside the
// per-session mounts alongside `/health`.
miscRoute.get("/pacing", miscController.getPacingOptions);

miscRoute.post("/call", miscController.callMethod);
miscRoute.post("/message-id", miscController.generateMessageId);
miscRoute.post("/media/upload", miscController.uploadMedia);
miscRoute.post("/media/download", miscController.downloadMedia);

// Outbound queue, scoped to this session.
miscRoute.get("/queue", miscController.getSessionQueue);
miscRoute.post("/queue/drain", miscController.drainQueue);

export default miscRoute;
