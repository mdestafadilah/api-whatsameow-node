import { Hono } from "hono";
import { messageController } from "./controller";

const messageRoute = new Hono();

messageRoute.post("/", messageController.sendMessage);
messageRoute.get("/", messageController.getMessages);

// Chat-level views and per-message operations.
messageRoute.get("/chats", messageController.getChats);
messageRoute.post("/read", messageController.markRead);
messageRoute.post("/reactions", messageController.reactToMessage);
messageRoute.post("/edit", messageController.editMessage);
messageRoute.post("/revoke", messageController.revokeMessage);

export default messageRoute;
