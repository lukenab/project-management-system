import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";

const systemAuditEventSchema = new Schema(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    targetType: {
      type: String,
      enum: ["USER_ACCOUNT", "PROJECT"],
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

systemAuditEventSchema.index({ createdAt: -1 });
systemAuditEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
systemAuditEventSchema.index({ actorId: 1, createdAt: -1 });
systemAuditEventSchema.index({ action: 1, createdAt: -1 });

systemAuditEventSchema.pre("validate", function () {
  if (this.action && this.action.trim().length === 0) {
    this.invalidate("action", "action cannot be blank");
  }
});

systemAuditEventSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    const rawReason =
      typeof ret.reason === "string"
        ? ret.reason.trim()
        : typeof ret.metadata?.reason === "string"
          ? ret.metadata.reason.trim()
          : "";
    const reason = rawReason.length > 0 ? rawReason : null;
    const rawDate = ret.createdAt ?? ret.occurredAt;
    const occurredAt =
      rawDate instanceof Date
        ? rawDate.toISOString()
        : typeof rawDate === "string"
          ? rawDate
          : new Date(0).toISOString();

    return {
      id: ret._id.toString(),
      actorId: ret.actorId ? ret.actorId.toString() : "",
      action: ret.action,
      targetType: ret.targetType,
      targetId: ret.targetId ? ret.targetId.toString() : "",
      reason,
      occurredAt,
    };
  },
});

export type SystemAuditEventDocument = HydratedDocument<
  InferSchemaType<typeof systemAuditEventSchema>
>;

export default model(
  "SystemAuditEvent",
  systemAuditEventSchema,
  "system_audit_events",
);
