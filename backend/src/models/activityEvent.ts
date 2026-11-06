import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";

const activityEventSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workItemId: {
      type: Schema.Types.ObjectId,
      ref: "WorkItem",
      default: null,
    },
    actionType: {
      type: String,
      required: true,
      trim: true,
    },
    oldValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

activityEventSchema.index({ projectId: 1, createdAt: -1 });
activityEventSchema.index({ projectId: 1, workItemId: 1, createdAt: -1 });

activityEventSchema.pre("validate", function () {
  if (this.actionType && this.actionType.trim().length === 0) {
    throw new Error("actionType cannot be blank");
  }
});

activityEventSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { _id, __v, ...activityEvent } = ret;
    return {
      id: _id.toString(),
      ...activityEvent,
    };
  },
});

export type ActivityEventDocument = HydratedDocument<
  InferSchemaType<typeof activityEventSchema>
>;

export default model("ActivityEvent", activityEventSchema, "activity_events");
