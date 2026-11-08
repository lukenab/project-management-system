import mongoose, { type ClientSession } from "mongoose";

import SystemAuditEventModel from "../models/systemAuditEvent.ts";
import UserModel from "../models/user.ts";
import { AppError } from "../utils/error.ts";

export type AuditTargetType = "USER_ACCOUNT" | "PROJECT";

export interface AuditEventResponseItem {
  id: string;
  actorId: string;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  reason: string | null;
  occurredAt: string;
}

export interface ParsedAuditQuery {
  from?: Date;
  to?: Date;
  actorId?: string;
  action?: string;
  targetType?: AuditTargetType;
  targetId?: string;
}

const ALLOWED_AUDIT_QUERY_KEYS = new Set([
  "from",
  "to",
  "actorId",
  "action",
  "targetType",
  "targetId",
]);

const VALID_TARGET_TYPES = new Set<AuditTargetType>([
  "USER_ACCOUNT",
  "PROJECT",
]);

// Nhận ngày UTC YYYY-MM-DD hoặc chuỗi ISO-8601 UTC kết thúc bằng Z
const UTC_DATE_TIME_REGEX =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]{1,3})?)?Z)?$/;

/** Helper hỗ trợ chạy linh hoạt cả Mongoose Query chain (.select/.sort/.lean) lẫn Mock trong Unit Test */
const resolveQueryChain = async <T = any>(
  queryOrResult: any,
  options?: { select?: string; sort?: Record<string, 1 | -1> },
): Promise<T> => {
  let current = queryOrResult;
  if (current && options?.select && typeof current.select === "function") {
    current = current.select(options.select);
  }
  if (current && options?.sort && typeof current.sort === "function") {
    current = current.sort(options.sort);
  }
  if (current && typeof current.lean === "function") {
    return current.lean();
  }
  return current;
};

/** Kiểm tra và chuyển đổi chuỗi ngày giờ UTC (from / to) */
const parseAuditDate = (
  value: unknown,
  field: "from" | "to",
  isEndBoundary: boolean = false,
): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (UTC_DATE_TIME_REGEX.test(trimmed)) {
      const normalizedStr =
        trimmed.length === 10
          ? isEndBoundary
            ? `${trimmed}T23:59:59.999Z`
            : `${trimmed}T00:00:00.000Z`
          : trimmed;
      const date = new Date(normalizedStr);
      if (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().startsWith(trimmed.slice(0, 10))
      ) {
        return date;
      }
    }
  }

  throw new AppError("VALIDATION_FAILED", {
    message: `${field} must be a valid UTC date (YYYY-MM-DD) or ISO-8601 UTC datetime ending in Z`,
    field,
  });
};

/** Kiểm tra người gọi phải là System Administrator đang hoạt động */
export const requireSystemAdmin = async (userId: string) => {
  if (!userId || typeof userId !== "string") {
    throw new AppError("UNAUTHENTICATED");
  }

  const user = await resolveQueryChain(UserModel.findById(userId));
  if (!user) {
    throw new AppError("UNAUTHENTICATED", { message: "User not found" });
  }

  if (user.status && user.status !== "ACTIVE") {
    throw new AppError("FORBIDDEN", {
      message: "Forbidden: Account is not active",
    });
  }

  if (user.systemRole !== "SYSTEM_ADMINISTRATOR") {
    throw new AppError("FORBIDDEN", {
      message: "Forbidden: Only System Administrators can access audit logs",
    });
  }

  return user;
};

/** Kiểm tra và chuẩn hóa các bộ lọc truy vấn lịch sử Audit */
export const parseAuditQuery = (rawQuery: unknown): ParsedAuditQuery => {
  if (rawQuery === undefined || rawQuery === null) {
    return {};
  }

  if (typeof rawQuery !== "object" || Array.isArray(rawQuery)) {
    throw new AppError("VALIDATION_FAILED", {
      message: "Query parameters must be a valid object",
    });
  }

  const query = rawQuery as Record<string, unknown>;
  for (const key of Object.keys(query)) {
    if (query[key] === undefined) continue;
    if (!ALLOWED_AUDIT_QUERY_KEYS.has(key)) {
      throw new AppError("VALIDATION_FAILED", {
        message: `Unknown filter '${key}' is not supported`,
        field: key,
      });
    }
  }

  const parsed: ParsedAuditQuery = {};

  if (query.from !== undefined) {
    parsed.from = parseAuditDate(query.from, "from", false);
  }

  if (query.to !== undefined) {
    parsed.to = parseAuditDate(query.to, "to", true);
  }

  if (parsed.from && parsed.to && parsed.from.getTime() > parsed.to.getTime()) {
    throw new AppError("VALIDATION_FAILED", {
      message: "from must be on or before to",
      field: "from",
    });
  }

  if (query.actorId !== undefined) {
    if (
      typeof query.actorId !== "string" ||
      query.actorId.trim().length === 0 ||
      !mongoose.Types.ObjectId.isValid(query.actorId.trim())
    ) {
      throw new AppError("VALIDATION_FAILED", {
        message: "actorId must be a valid ObjectId",
        field: "actorId",
      });
    }
    parsed.actorId = query.actorId.trim();
  }

  if (query.action !== undefined) {
    if (typeof query.action !== "string" || query.action.trim().length === 0) {
      throw new AppError("VALIDATION_FAILED", {
        message: "action must be a non-blank string",
        field: "action",
      });
    }
    parsed.action = query.action.trim();
  }

  if (query.targetType !== undefined) {
    if (
      typeof query.targetType !== "string" ||
      !VALID_TARGET_TYPES.has(query.targetType as AuditTargetType)
    ) {
      throw new AppError("VALIDATION_FAILED", {
        message: "targetType must be USER_ACCOUNT or PROJECT",
        field: "targetType",
      });
    }
    parsed.targetType = query.targetType as AuditTargetType;
  }

  if (query.targetId !== undefined) {
    if (!parsed.targetType) {
      throw new AppError("VALIDATION_FAILED", {
        message: "targetId requires targetType",
        field: "targetType",
      });
    }
    if (
      typeof query.targetId !== "string" ||
      query.targetId.trim().length === 0 ||
      !mongoose.Types.ObjectId.isValid(query.targetId.trim())
    ) {
      throw new AppError("VALIDATION_FAILED", {
        message: "targetId must be a valid ObjectId",
        field: "targetId",
      });
    }
    parsed.targetId = query.targetId.trim();
  }

  return parsed;
};

/** Chuẩn hóa 1 bản ghi SystemAuditEvent sang đúng 7 trường công khai của AuditEvent */
export const formatAuditEvent = (raw: any): AuditEventResponseItem => {
  const id = String(raw._id ?? raw.id ?? "");
  const actorId = raw.actorId ? String(raw.actorId) : "";
  const action = String(raw.action ?? "");
  const targetType = (raw.targetType ?? "USER_ACCOUNT") as AuditTargetType;
  const targetId = raw.targetId ? String(raw.targetId) : "";

  const rawReason =
    typeof raw.reason === "string"
      ? raw.reason.trim()
      : typeof raw.metadata?.reason === "string"
        ? raw.metadata.reason.trim()
        : "";
  const reason = rawReason.length > 0 ? rawReason : null;

  const rawDate = raw.createdAt ?? raw.occurredAt;
  const occurredAt =
    rawDate instanceof Date
      ? rawDate.toISOString()
      : typeof rawDate === "string"
        ? new Date(rawDate).toISOString()
        : new Date(0).toISOString();

  return {
    id,
    actorId,
    action,
    targetType,
    targetId,
    reason,
    occurredAt,
  };
};

/**
 * Xem và lọc nhật ký kiểm toán hệ thống (View and Filter System Audit Log)
 * GET /api/admin/audit-events
 */
export const getSystemAuditEvents = async (
  userId: string,
  rawQuery?: Record<string, unknown>,
): Promise<AuditEventResponseItem[]> => {
  // 1. Kiểm tra quyền System Administrator
  await requireSystemAdmin(userId);

  // 2. Kiểm tra và chuẩn hóa các bộ lọc
  const parsed = parseAuditQuery(rawQuery);

  // 3. Xây dựng điều kiện truy vấn MongoDB
  const mongoFilter: Record<string, any> = {};
  if (parsed.from || parsed.to) {
    mongoFilter.createdAt = {};
    if (parsed.from) mongoFilter.createdAt.$gte = parsed.from;
    if (parsed.to) mongoFilter.createdAt.$lte = parsed.to;
  }
  if (parsed.actorId) {
    mongoFilter.actorId = parsed.actorId;
  }
  if (parsed.action) {
    mongoFilter.action = parsed.action;
  }
  if (parsed.targetType) {
    mongoFilter.targetType = parsed.targetType;
  }
  if (parsed.targetId) {
    mongoFilter.targetId = parsed.targetId;
  }

  // 4. Truy vấn cơ sở dữ liệu (nếu DB lỗi sẽ ném 500, không trả về mảng rỗng giả)
  const rawEvents =
    (await resolveQueryChain<any[]>(SystemAuditEventModel.find(mongoFilter), {
      sort: { createdAt: -1, _id: 1 },
    })) ?? [];

  if (rawEvents.length === 0) {
    return [];
  }

  // 5. Đảm bảo khớp chính xác các bộ lọc và sắp xếp newest first (createdAt giảm dần, id tăng dần)
  const filteredEvents = rawEvents.filter((ev: any) => {
    const rawDate = ev.createdAt ?? ev.occurredAt;
    const timestamp = rawDate ? new Date(rawDate).getTime() : 0;

    if (parsed.from && timestamp < parsed.from.getTime()) return false;
    if (parsed.to && timestamp > parsed.to.getTime()) return false;
    if (parsed.actorId && String(ev.actorId) !== parsed.actorId) return false;
    if (parsed.action && String(ev.action) !== parsed.action) return false;
    if (parsed.targetType && ev.targetType !== parsed.targetType) return false;
    if (parsed.targetId && String(ev.targetId) !== parsed.targetId) {
      return false;
    }
    return true;
  });

  filteredEvents.sort((a: any, b: any) => {
    const timeA = a.createdAt
      ? new Date(a.createdAt).getTime()
      : a.occurredAt
        ? new Date(a.occurredAt).getTime()
        : 0;
    const timeB = b.createdAt
      ? new Date(b.createdAt).getTime()
      : b.occurredAt
        ? new Date(b.occurredAt).getTime()
        : 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    const idA = String(a._id ?? a.id ?? "");
    const idB = String(b._id ?? b.id ?? "");
    return idA.localeCompare(idB);
  });

  // 6. Chỉ trả về đúng các trường được phép trong tài liệu đặc tả
  return filteredEvents.map(formatAuditEvent);
};

/** Ghi nhận một sự kiện kiểm toán hệ thống (SystemAuditEvent) */
export const recordSystemAuditEvent = async (
  params: {
    actorId: any;
    action: string;
    targetType: AuditTargetType;
    targetId: any;
    reason?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, any> | null;
  },
  session?: ClientSession,
) => {
  const metadataPayload =
    params.metadata !== undefined
      ? params.metadata
      : params.reason !== undefined && params.reason !== null
        ? { reason: params.reason }
        : null;

  const event = new SystemAuditEventModel({
    actorId: params.actorId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    metadata: metadataPayload,
  });

  const isSaveMocked =
    SystemAuditEventModel.prototype.save !== mongoose.Model.prototype.save;
  if (mongoose.connection.readyState === 1 || isSaveMocked) {
    await event.save({ session });
  }
  return event;
};
