import type { Profile } from "./auth";

import { request } from "./api";

/** Changes the display name; returns the updated profile. */
export const updateProfile = (input: { fullName: string }) =>
  request<Profile>("PATCH", "/api/me", input);

/** Changes the password; the backend signs out the account's other sessions. */
export const changePassword = (input: {
  currentPassword: string;
  newPassword: string;
}) => request<void>("PUT", "/api/me/password", input);
