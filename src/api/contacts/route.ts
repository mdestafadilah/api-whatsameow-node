import { Hono } from "hono";
import { contactController } from "./controller";

const contactRoute = new Hono();

contactRoute.post("/check", contactController.checkNumbers);
contactRoute.post("/info", contactController.getInfo);
contactRoute.post("/devices", contactController.getDevices);
contactRoute.get("/picture", contactController.getProfilePicture);
contactRoute.get("/business", contactController.getBusinessProfile);

export default contactRoute;
