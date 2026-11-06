/** Nội dung JWT đăng nhập: id người dùng và id phiên trong auth_sessions */
export interface UserPayload {
  id: string;
  sid: string;
}
