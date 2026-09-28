import { Hono } from "hono";
import { groupController } from "./controller";

const groupRoute = new Hono();

groupRoute.get("/", groupController.getGroups);
groupRoute.post("/", groupController.createGroup);
groupRoute.get("/info", groupController.getGroupById);
groupRoute.put("/", groupController.updateGroup);

groupRoute.get("/invite-link", groupController.getInviteLink);
groupRoute.get("/preview", groupController.getGroupFromInvite);

groupRoute.post("/join", groupController.joinGroup);
groupRoute.post("/leave", groupController.leaveGroup);
groupRoute.put("/participants", groupController.updateParticipants);

groupRoute.get("/requests", groupController.getPendingRequests);
groupRoute.post("/requests", groupController.handleJoinRequests);

export default groupRoute;
