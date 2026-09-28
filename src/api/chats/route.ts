import { Hono } from "hono";
import { chatController } from "./controller";

const chatRoute = new Hono();

// Presence & typing
chatRoute.post("/typing", chatController.setTyping);
chatRoute.post("/presence", chatController.setPresence);
chatRoute.post("/presence/subscribe", chatController.subscribePresence);

// Privacy
chatRoute.get("/privacy", chatController.getPrivacy);
chatRoute.put("/privacy", chatController.setPrivacy);
chatRoute.get("/privacy/status", chatController.getStatusPrivacy);

// Blocklist
chatRoute.get("/blocklist", chatController.getBlocklist);
chatRoute.put("/blocklist", chatController.updateBlocklist);

// Disappearing messages
chatRoute.put("/disappearing", chatController.setDefaultDisappearingTimer);
chatRoute.put("/disappearing/chat", chatController.setDisappearingTimer);

// Profile & QR links
chatRoute.put("/status-message", chatController.setStatusMessage);
chatRoute.get("/qr", chatController.getContactQr);
chatRoute.post("/qr/resolve", chatController.resolveContactQr);

export default chatRoute;
