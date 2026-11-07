import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";

const sprintSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    goal: {
      type: String,
      trim: true,
      default: null,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "CLOSED"],
      default: "DRAFT",
    },
    startedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Ngày kết thúc tối đa: cùng ngày của tháng kế tiếp, tính theo UTC.
// Tháng đó ngắn hơn thì JS tràn sang tháng sau (31/01 -> 03/03), nên lùi về ngày cuối tháng đích (28/02).
function maxSprintEnd(startDate: Date) {
  const maxEnd = new Date(startDate);
  maxEnd.setUTCMonth(maxEnd.getUTCMonth() + 1);
  if (maxEnd.getUTCDate() !== startDate.getUTCDate()) maxEnd.setUTCDate(0);
  return maxEnd;
}

sprintSchema.pre("validate", function () {
  if (this.startDate && this.endDate) {
    if (this.endDate <= this.startDate) {
      this.invalidate(
        "endDate",
        "endDate must be after startDate",
        this.endDate,
      );
    } else if (this.endDate > maxSprintEnd(this.startDate)) {
      this.invalidate(
        "endDate",
        "A Sprint can last at most one month",
        this.endDate,
      );
    }
  }

  // Chuyển sang ACTIVE phải có đủ ngày
  if (this.status === "ACTIVE" && (!this.startDate || !this.endDate)) {
    this.invalidate(
      "status",
      "ACTIVE sprint must have both startDate and endDate",
      this.status,
    );
  }
});

sprintSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { _id, __v, deletedAt: _deletedAt, ...sprint } = ret;
    return {
      id: _id.toString(),
      ...sprint,
    };
  },
});

export type SprintDocument = HydratedDocument<
  InferSchemaType<typeof sprintSchema>
>;

export default model("Sprint", sprintSchema);
