import express from "express";
import { set, connect } from "mongoose";

import { MONGODB_URI } from "./utils/config.ts";
import logger from "./utils/logger.ts";
import { errorHandler, unknownEndpoint } from "./utils/middleware.ts";
import workItemController from "./controllers/workitem.ts";

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

// Handle unknown routes (404)
app.use(unknownEndpoint);

// Global error handler (MUST BE PLACED LAST, after all routes)
app.use(errorHandler);
app.use("/api/projects/:projectId/work-items", workItemController);

export default app;
