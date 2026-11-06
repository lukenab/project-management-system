import express from "express";
import { set, connect } from "mongoose";

import adminUserController from "./controllers/admin/user.ts";
import authController from "./controllers/auth.ts";
import boardController from "./controllers/board.ts";
import sprintController from "./controllers/sprints.ts";
import workItemController from "./controllers/workitem.ts";
import { MONGODB_URI } from "./utils/config.ts";
import logger from "./utils/logger.ts";
import { errorHandler, unknownEndpoint } from "./utils/middleware.ts";

const app = express();

set("strictQuery", false);

if (!MONGODB_URI) {
  throw new Error("MongoDB connection string is empty");
}

logger.info("connecting to", MONGODB_URI);

connect(MONGODB_URI)
  .then(() => {
    logger.info("connected to MongoDB");
  })
  .catch((err) => {
    logger.error("error connecting to MongoDB:", err.message);
  });

app.use(express.json());

// TODO: Defines routes
app.use("/api/auth", authController);
app.use("/api/projects/", boardController);
app.use("/api/projects/:projectId/work-items", workItemController);
app.use("/api/projects/:projectId/sprints", sprintController);

app.use("/api/admin", adminUserController);

// Handle unknown routes (404)
app.use(unknownEndpoint);

// Global error handler (MUST BE PLACED LAST, after all routes)
app.use(errorHandler);

export default app;
