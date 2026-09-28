import { Hono } from "hono";
import { sessionController } from "./controller";

const sessionRoute = new Hono();

sessionRoute.get("/", sessionController.getSessions);
sessionRoute.post("/", sessionController.createSession);

sessionRoute.get("/:id", sessionController.getSessionById);
sessionRoute.delete("/:id", sessionController.removeSession);

// Pairing
sessionRoute.get("/:id/qr", sessionController.getSessionQr);
sessionRoute.post("/:id/pair-code", sessionController.requestPairCode);

// Connection lifecycle
sessionRoute.get("/:id/status", sessionController.getSessionStatus);
sessionRoute.post("/:id/connect", sessionController.connectSession);
sessionRoute.post("/:id/disconnect", sessionController.disconnectSession);
sessionRoute.post("/:id/logout", sessionController.logoutSession);

export default sessionRoute;
