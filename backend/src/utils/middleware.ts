import type { NextFunction, Request, Response } from "express";

import jwt from "jsonwebtoken";

import type { UserPayload } from "../types/jwt.ts";

import User from "../models/user.ts";
import logger from "./logger.ts";

export const requestLogger = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  logger.info("Method:", req.method);
  logger.info("Path:  ", req.path);
  logger.info("Body:  ", req.body);
  logger.info("---");
  next();
};

export const unknownEndpoint = (_req: Request, res: Response) => {
  res.status(404).send({ error: "unknown endpoint" });
};

export const errorHandler = (
  error: any,
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  logger.error(error.message);

  if (error.name === "CastError") {
    return res.status(400).send({ error: "malformatted id" });
  } else if (error.name === "ValidationError") {
    return res.status(400).json({ error: error.message });
  } else if (
    error.name === "MongoServerError" &&
    error.message.includes("E11000 duplicate key error")
  ) {
    return res.status(400).json({ error: "expected `username` to be unique" });
  }

  next(error);
};

const getTokenFrom = (req: Request) => {
  const authorization = req.get("authorization");
  if (authorization && authorization.startsWith("Bearer ")) {
    return authorization.replace("Bearer ", "");
  }
  return null;
};

export const userExtractor = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = getTokenFrom(req);

  if (!token) {
    return res.status(401).json({ error: "token missimg" });
  }

  if (!process.env.SECRET) {
    throw new Error("JWT secret is empty");
  }

  const decodedToken = jwt.verify(token, process.env.SECRET) as UserPayload;
  if (!decodedToken.id) {
    return res.status(401).json({ error: "token invalid" });
  }

  const user = await User.findById(decodedToken.id);

  if (!user) {
    return res.status(401).json({ error: "user not found" });
  }

  req.user = user;

  next();
};
