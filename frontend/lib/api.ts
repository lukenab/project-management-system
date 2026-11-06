type ErrorBody = { error?: string; code?: string; field?: string };

/** Error response of the backend: `{ error, code, field? }` (see docs/api/errors.md). */
export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Sends a JSON request and returns the parsed JSON body (`undefined` for 204).
 * Failures throw `ApiError`: the backend's error body for 4xx/5xx, or
 * `NETWORK_ERROR` when the server cannot be reached or does not answer in time.
 */
export async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      timedOut
        ? "The server took too long to respond. Please try again."
        : "We couldn’t reach the server. Check your connection and try again.",
    );
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = (data ?? {}) as ErrorBody;
    throw new ApiError(
      response.status,
      failure.code ?? "UNKNOWN",
      failure.error ?? "Something went wrong. Please try again.",
      failure.field,
    );
  }
  return (data ?? undefined) as T;
}
