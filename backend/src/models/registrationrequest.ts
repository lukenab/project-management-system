import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";

const registrationRequestSchema = new Schema(
  {
    email: { type: String, required: true, index: true },
    codeDigest: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    resendCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    tokenDigest: { type: String, default: null },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 60 * 60 },
    },
  },
  { timestamps: true, collection: "registration_requests" },
);

registrationRequestSchema.index(
  { tokenDigest: 1 },
  { partialFilterExpression: { tokenDigest: { $type: "string" } } },
);

export type RegistrationRequestDocument = HydratedDocument<
  InferSchemaType<typeof registrationRequestSchema>
>;

export default model("RegistrationRequest", registrationRequestSchema);
