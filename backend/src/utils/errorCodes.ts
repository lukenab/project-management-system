export const ErrorCode = {
  VALIDATION_FAILED: { status: 400, message: "Invalid request" },
  INVALID_ID: { status: 400, message: "malformatted id" },
  UNAUTHENTICATED: { status: 401, message: "Authentication required" },
  INVALID_TOKEN: { status: 401, message: "Invalid token" },
  TOKEN_EXPIRED: { status: 401, message: "Token expired" },
  FORBIDDEN: { status: 403, message: "Permission denied" },
  NOT_PROJECT_MEMBER: {
    status: 403,
    message: "You are not an active member of this project",
  },
  NOT_FOUND: { status: 404, message: "Resource not found" },
  CONFLICT: { status: 409, message: "Conflict" },
  PROJECT_ARCHIVED: {
    status: 409,
    message: "Archived project does not allow modifications",
  },
  DUPLICATE_VALUE: { status: 409, message: "Duplicate value" },
  INTERNAL_ERROR: { status: 500, message: "Internal Server Error" },
  NOT_IMPLEMENTED: { status: 501, message: "Not implemented" },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCodeKey = keyof typeof ErrorCode;

// Mã mặc định cho lỗi tạo bằng createError(status, message) kiểu cũ
const DEFAULT_CODE_BY_STATUS: Record<number, ErrorCodeKey> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  501: "NOT_IMPLEMENTED",
};

export const defaultCode = (status: number): ErrorCodeKey =>
  DEFAULT_CODE_BY_STATUS[status] ??
  (status >= 500 ? "INTERNAL_ERROR" : "VALIDATION_FAILED");
