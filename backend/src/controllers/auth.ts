import type { NextFunction, Request, Response } from "express";

import { Router } from "express";

import {
  completeRegistration,
  login,
  logout,
  requestRegistration,
  resendRegistration,
  verifyRegistration,
} from "../services/auth.ts";
import { googleConfirm, googleSignIn } from "../services/googleAuth.ts";
import {
  requestPasswordReset,
  resetPassword,
} from "../services/passwordReset.ts";
import { userExtractor } from "../utils/middleware.ts";

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

// POST /api/auth/login
router.post(
  "/login",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await login(req.body);
      return res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/logout
router.post(
  "/logout",
  userExtractor,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await logout(req.sessionId as string);
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/password-reset-requests
router.post(
  "/password-reset-requests",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await requestPasswordReset(req.body);
      return res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/password-resets
router.post(
  "/password-resets",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await resetPassword(req.body);
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/google
router.post(
  "/google",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      return res.status(200).json(await googleSignIn(req.body));
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/auth/google/confirm
router.post(
  "/google/confirm",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      return res.status(201).json(await googleConfirm(req.body));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
