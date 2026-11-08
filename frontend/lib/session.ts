export const ACCESS_TOKEN_COOKIE = "access_token";

/** Same lifetime as the backend session and token: 7 days, in seconds. */
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

/** Address of the backend; read when the server runs, so changing it needs no rebuild. */
export const backendUrl = () =>
  process.env.BACKEND_URL ?? "http://localhost:3003";
