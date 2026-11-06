import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, default: null },
    googleSubject: { type: String, default: null },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    avatarUrl: { type: String, default: null },
    emailVerifiedAt: { type: Date, default: null },
    systemRole: {
      type: String,
      enum: ["STAFF", "SYSTEM_ADMINISTRATOR"],
      default: "STAFF",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "DELETED"],
      default: "ACTIVE",
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "user_accounts" },
);

// Mỗi định danh Google chỉ gắn với một tài khoản; tài khoản chưa liên kết (null) không bị ràng buộc
userSchema.index(
  { googleSubject: 1 },
  {
    unique: true,
    partialFilterExpression: { googleSubject: { $type: "string" } },
  },
);

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { _id, __v, passwordHash: _passwordHash, ...user } = ret;
    return {
      id: _id.toString(),
      ...user,
    };
  },
});

export type UserDocument = HydratedDocument<InferSchemaType<typeof userSchema>>;

export default model("User", userSchema);
