import type { NextFunction, Request, Response } from "express";

import { Router } from "express";

import {
  completeRegistration,
  requestRegistration,
  resendRegistration,
  verifyRegistration,
} from "../services/auth.ts";

const router = Router();

// POST /api/auth/registration-requests
router.post(
  "/registration-requests",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await requestRegistration(req.body);
      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/registration-requests/:requestId/verify
router.post(
  "/registration-requests/:requestId/verify",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await verifyRegistration(
        req.params.requestId as string,
        req.body,
      );
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/registration-requests/:requestId/resend
router.post(
  "/registration-requests/:requestId/resend",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await resendRegistration(req.params.requestId as string);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/register
router.post(
  "/register",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await completeRegistration(req.body);
      return res.status(201).json(profile);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
