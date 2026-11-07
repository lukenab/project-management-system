import { Schema, model } from "mongoose";

// Link đặt lại mật khẩu đã gửi cho một tài khoản (collection password_reset_tokens).
// Mỗi tài khoản chỉ giữ một link; chỉ lưu bản băm của token.
const passwordResetTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenDigest: { type: String, required: true, unique: true },
    // MongoDB tự xóa token hết hạn (TTL)
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true, collection: "password_reset_tokens" },
);

export default model("PasswordResetToken", passwordResetTokenSchema);
