import { model, Schema } from "mongoose";

const projectSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Tiền tố khóa Work Item (ví dụ COM-19): duy nhất toàn hệ thống, đặt khi tạo và không đổi
    key: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      match: /^[A-Z][A-Z0-9]{1,9}$/,
    },
    description: {
      type: String,
      default: null,
      maxlength: 500,
    },
    status: {
      type: String,
      required: true,
      enum: ["ACTIVE", "ARCHIVED"],
      default: "ACTIVE",
    },
    archivedAt: {
      type: Date,
      default: null,
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
