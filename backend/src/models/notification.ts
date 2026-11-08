import { Schema, model } from "mongoose";

const notificationSchema = new Schema(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    activityEventId: {
      type: Schema.Types.ObjectId,
      ref: "ActivityEvent",
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ recipientId: 1, createdAt: -1, _id: -1 });
notificationSchema.index(
  { recipientId: 1, activityEventId: 1 },
  { unique: true },
);

export default model("Notification", notificationSchema);
