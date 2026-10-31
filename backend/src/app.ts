import express from "express";
import { set, connect } from "mongoose";

import { MONGODB_URI } from "./utils/config.ts";
import logger from "./utils/logger.ts";

import boardController from "./controllers/board.ts";

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

app.use("/api/projects/", boardController);

export default app;
