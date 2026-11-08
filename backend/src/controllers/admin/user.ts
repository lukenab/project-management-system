import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";

import * as userService from "../../services/user.ts";
import { createError } from "../../utils/error.ts";
import { requireAdmin, userExtractor } from "../../utils/middleware.ts";

const router = Router();

const VALID_STATUSES = new Set(["ACTIVE", "SUSPENDED", "DELETED"]);
const VALID_ROLES = new Set(["STAFF", "SYSTEM_ADMINISTRATOR"]);

router.use(userExtractor, requireAdmin);

// GET /api/admin/users
router.get(
  "/users",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { search, role, status, page, limit } = req.query;

      // 1. Validate search query
      if (search !== undefined && typeof search !== "string") {
        throw createError(400, "Invalid search parameter");
      }

      // 2. Validate role query filter
      if (role !== undefined) {
        if (typeof role !== "string" || !VALID_ROLES.has(role)) {
          throw createError(
            400,
            `Invalid role filter. Allowed roles: ${Array.from(VALID_ROLES).join(", ")}`,
          );
        }
      }

      // 3. Validate status query filter
      if (status !== undefined) {
        if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
          throw createError(
            400,
            `Invalid status filter. Allowed statuses: ${Array.from(VALID_STATUSES).join(", ")}`,
          );
        }
      }

      // 4. Validate pagination (page, limit)
      let parsedPage = 1;
      let parsedLimit = 10;

      if (page !== undefined) {
        parsedPage = Number(page);
        if (!Number.isSafeInteger(parsedPage) || parsedPage < 1) {
          throw createError(400, "Page must be a positive integer");
        }
      }

      if (limit !== undefined) {
        parsedLimit = Number(limit);
        if (
          !Number.isInteger(parsedLimit) ||
          parsedLimit < 1 ||
          parsedLimit > 100
        ) {
          throw createError(400, "Limit must be an integer between 1 and 100");
        }
      }

      if (!Number.isSafeInteger((parsedPage - 1) * parsedLimit)) {
        throw createError(400, "Page offset is too large");
      }

      const result = await userService.getUsers({
        search: (search as string)?.trim(),
        role: role as string,
        status: status as string,
        page: parsedPage,
        limit: parsedLimit,
      });

      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/admin/users/:userId
router.get(
  "/users/:userId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      if (!userId || typeof userId !== "string") {
        throw createError(400, "Missing userId or userId invalid");
      }

      const user = await userService.getUserDetail(userId);
      return res.status(200).json(user);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/admin/users/:userId/suspend
router.post(
  "/users/:userId/suspend",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const adminId = req.user?.id;

      if (!userId || typeof userId !== "string") {
        throw createError(400, "Missing userId or userId invalid");
      }

      if (!adminId || typeof adminId !== "string") {
        throw createError(401, "Unauthorized");
      }

      const body = req.body;
      if (!body || typeof body !== "object") {
        throw createError(400, "Request body must be an object");
      }

      const { reason } = body;
      if (typeof reason !== "string" || !reason.trim()) {
        throw createError(
          400,
          "Reason is required and must be a non-blank string",
        );
      }

      const targetId = userId.toLowerCase();
      const updated = await userService.accountTransaction(
        targetId,
        adminId,
        (session) =>
          userService.suspendUser(targetId, adminId, reason.trim(), session),
      );

      return res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/admin/users/:userId/reactivate
router.post(
  "/users/:userId/reactivate",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const adminId = req.user?.id;

      if (!userId || typeof userId !== "string") {
        throw createError(400, "Missing userId or userId invalid");
      }

      if (!adminId || typeof adminId !== "string") {
        throw createError(401, "Unauthorized");
      }

      const targetId = userId.toLowerCase();
      const updated = await userService.accountTransaction(
        targetId,
        adminId,
        (session) => userService.reactivateUser(targetId, adminId, session),
      );

      return res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/users/:userId/delete",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const adminId = req.user?.id;
      if (typeof userId !== "string") throw createError(400, "Invalid user ID");
      if (!adminId) throw createError(401, "Unauthorized");

      const reason = req.body?.reason;
      if (typeof reason !== "string" || !reason.trim()) {
        throw createError(
          400,
          "Reason is required and must be a non-blank string",
        );
      }
      const targetId = userId.toLowerCase();
      await userService.accountTransaction(targetId, adminId, (session) =>
        userService.deleteUser(targetId, adminId, reason.trim(), session),
      );
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
