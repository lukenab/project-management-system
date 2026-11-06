import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import * as userService from "../../services/user.ts";

const router = Router();

// GET /api/admin/users
router.get(
  "/users",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { search, role, status, page, limit } = req.query;
      const result = await userService.getUsers({
        search: search as string,
        role: role as string,
        status: status as string,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10,
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
      const user = await userService.getUserDetail(req.params.userId as string);
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
      const { status } = req.body;
      const updated = await userService.updateUserStatus(
        req.params.userId as string,
        status,
        req.user!.id,
      );
      return res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
