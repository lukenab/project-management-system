import { model, Schema } from "mongoose";

const projectSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: null,
    },
    productGoal: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ["ACTIVE", "ARCHIVED"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
  },
);

projectSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { _id, __v, ...project } = ret;
    return {
      id: _id.toString(),
      ...project,
    };
  },
});

export default model("Project", projectSchema);
