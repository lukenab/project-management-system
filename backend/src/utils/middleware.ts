import type { NextFunction, Request, Response } from "express";

import { authenticate } from "../services/auth.ts";
import { AppError, toErrorResponse } from "./error.ts";
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
  const { status, body } = toErrorResponse(
    new AppError("NOT_FOUND", { message: "unknown endpoint" }),
  );
  res.status(status).json(body);
};

export const errorHandler = (
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const { status, body } = toErrorResponse(error);
  // Lỗi 5xx là lỗi không lường trước nên ghi cả stack; các lỗi còn lại chỉ ghi thông báo
  logger.error(status >= 500 ? error : error?.message);
  return res.status(status).json(body);
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
  _res: Response,
  next: NextFunction,
) => {
  // try/catch để lỗi (token sai, hết hạn...) đi vào errorHandler thay vì làm sập tiến trình
  try {
    const token = getTokenFrom(req);
    if (!token) throw new AppError("UNAUTHENTICATED");

    const { user, sessionId } = await authenticate(token);
    req.user = user;
    req.sessionId = sessionId;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    throw new AppError("UNAUTHENTICATED");
  }
  if (req.user.systemRole !== "SYSTEM_ADMINISTRATOR") {
    throw new AppError("FORBIDDEN", {
      message: "Access denied. System Administrator role required.",
    });
  }
  next();
};
