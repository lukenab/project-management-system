import { model, Schema } from "mongoose";

const projectMembershipSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    accessRole: {
      type: String,
      enum: ["OWNER", "MEMBER"],
      required: true,
    },
    scrumRole: {
      type: String,
      enum: ["PRODUCT_OWNER", "SCRUM_MASTER", "DEVELOPER"],
      default: null,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "LEFT", "REMOVED"],
      default: "ACTIVE",
    },
    joinedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

projectMembershipSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { _id, __v, ...membership } = ret;
    return {
      id: _id.toString(),
      ...membership,
    };
  },
});

export default model("ProjectMembership", projectMembershipSchema);
