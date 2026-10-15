import type { UserDocument } from "../models/user.ts";

declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
    }
  }
}
