import { ErrorCode, defaultCode, type ErrorCodeKey } from "./errorCodes.ts";

export class AppError extends Error {
  status: number;
  code: ErrorCodeKey;
  field?: string;

  constructor(
    code: ErrorCodeKey,
    options: { message?: string; field?: string } = {},
  ) {
    super(options.message ?? ErrorCode[code].message);
    this.name = "AppError";
    this.code = code;
    this.status = ErrorCode[code].status;
    this.field = options.field;
  }
}

export const createError = (status: number, message: string) => {
  const error = new AppError(defaultCode(status), { message });
  error.status = status;
  return error;
};

export type ErrorResponse = {
  error: string;
  code: ErrorCodeKey;
  field?: string;
};

const respond = (
  code: ErrorCodeKey,
  message: string = ErrorCode[code].message,
  field?: string,
) => ({
  status: ErrorCode[code].status as number,
  body: { error: message, code, ...(field ? { field } : {}) } as ErrorResponse,
});

export const toErrorResponse = (error: any) => {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
        ...(error.field ? { field: error.field } : {}),
      } as ErrorResponse,
    };
  }

  if (typeof error?.status === "number") {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: defaultCode(error.status),
      } as ErrorResponse,
    };
  }

  switch (error?.name) {
    case "ValidationError": {
      const first: any = Object.values(error.errors ?? {})[0];
      return respond(
        "VALIDATION_FAILED",
        first?.message ?? error.message,
        first?.path,
      );
    }
    case "CastError":
      return respond("INVALID_ID");
    case "TokenExpiredError":
      return respond("TOKEN_EXPIRED");
    case "JsonWebTokenError":
    case "NotBeforeError":
      return respond("INVALID_TOKEN");
  }

  if (
    error?.name === "MongoServerError" &&
    (error.code === 11000 ||
      String(error.message).includes("E11000 duplicate key error"))
  ) {
    return respond(
      "DUPLICATE_VALUE",
      undefined,
      Object.keys(error.keyValue ?? {})[0],
    );
  }

  return respond("INTERNAL_ERROR");
};
