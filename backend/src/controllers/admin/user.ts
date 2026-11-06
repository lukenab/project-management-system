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
const ALLOWED_STATUS_PATCH_FIELDS = new Set(["status"]);

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
        if (!Number.isInteger(parsedPage) || parsedPage < 1) {
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

// PATCH /api/admin/users/:userId/status
router.patch(
  "/users/:userId/status",
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

      // 1. Kiểm tra Body không được rỗng
      if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
        throw createError(400, "Request body cannot be empty");
      }

      // 2. Chặn các trường không thuộc phạm vi cập nhật status
      for (const key of Object.keys(body)) {
        if (!ALLOWED_STATUS_PATCH_FIELDS.has(key)) {
          throw createError(
            400,
            `Field '${key}' is not allowed. Only 'status' can be updated here`,
          );
        }
      }

      const { status } = body;
      if (!status || typeof status !== "string") {
        throw createError(400, "Missing status or status invalid");
      }

      if (!VALID_STATUSES.has(status)) {
        throw createError(
          400,
          `Invalid status. Must be one of: ${Array.from(VALID_STATUSES).join(", ")}`,
        );
      }

      const updated = await userService.updateUserStatus(
        userId,
        status as "ACTIVE" | "SUSPENDED" | "DELETED",
        adminId,
      );

      return res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
