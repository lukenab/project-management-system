import type { NextFunction, Request, Response } from "express";

import jwt from "jsonwebtoken";

import type { UserPayload } from "../types/jwt.ts";

import User from "../models/user.ts";
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

    if (!process.env.SECRET) {
      throw new Error("JWT secret is empty");
    }

    // Ném JsonWebTokenError hoặc TokenExpiredError nếu chữ ký sai hoặc hết hạn
    const decodedToken = jwt.verify(token, process.env.SECRET) as UserPayload;
    if (!decodedToken.id) throw new AppError("INVALID_TOKEN");

    const user = await User.findById(decodedToken.id);
    if (!user) {
      throw new AppError("UNAUTHENTICATED", { message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
