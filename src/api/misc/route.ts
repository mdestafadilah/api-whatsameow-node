import { Hono } from "hono";
import { miscController } from "./controller";

const miscRoute = new Hono();

miscRoute.get("/health", miscController.getHealth);

miscRoute.post("/call", miscController.callMethod);
miscRoute.post("/message-id", miscController.generateMessageId);
miscRoute.post("/media/upload", miscController.uploadMedia);
miscRoute.post("/media/download", miscController.downloadMedia);

export default miscRoute;
