import { Router } from "express";

import {
  listNotifications,
  markNotificationRead,
  markNotificationsRead,
} from "../services/notifications.ts";
import { createError } from "../utils/error.ts";
import { userExtractor } from "../utils/middleware.ts";

const router = Router();
router.use(userExtractor);

router.get("/", async (req, res) => {
  if (!req.user) throw createError(401, "Unauthorized");
  res.json(await listNotifications(req.user.id));
});

router.patch("/:notificationId/read", async (req, res) => {
  if (!req.user) throw createError(401, "Unauthorized");
  res.json(await markNotificationRead(req.user.id, req.params.notificationId));
});

router.post("/read-all", async (req, res) => {
  if (!req.user) throw createError(401, "Unauthorized");
  await markNotificationsRead(req.user.id, req.body?.notificationIds);
  res.sendStatus(204);
});

export default router;
