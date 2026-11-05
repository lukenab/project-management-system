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
      validate: {
        validator: (value: string) => value.length > 0,
        message: "Sprint name cannot be blank",
      },
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
      required: true,
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
    closeNote: {
      type: String,
      trim: true,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export function latestAllowedEnd(start: Date) {
  const maxEnd = new Date(start);
  const day = start.getUTCDate();
  maxEnd.setUTCDate(1);
  maxEnd.setUTCMonth(maxEnd.getUTCMonth() + 1);
  const lastDayOfMonth = new Date(
    Date.UTC(maxEnd.getUTCFullYear(), maxEnd.getUTCMonth() + 1, 0),
  ).getUTCDate();
  maxEnd.setUTCDate(Math.min(day, lastDayOfMonth));
  return maxEnd;
}

sprintSchema.pre("validate", function () {
  if (this.startDate && this.endDate) {
    if (this.endDate <= this.startDate) {
      this.invalidate("endDate", "endDate must be after startDate");
    } else if (this.endDate > latestAllowedEnd(this.startDate)) {
      this.invalidate("endDate", "A Sprint can last at most one month");
    }
  }

  if (this.status === "ACTIVE") {
    if (!this.startDate || !this.endDate) {
      this.invalidate(
        "startDate",
        "An ACTIVE Sprint must have both startDate and endDate",
      );
    }
  }
});

sprintSchema.index(
  { projectId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE", deletedAt: null },
    name: "one_live_active_sprint_per_project",
  },
);

sprintSchema.index(
  { projectId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
    partialFilterExpression: { deletedAt: null },
    name: "unique_live_sprint_name_per_project",
  },
);

sprintSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { _id, __v, ...sprint } = ret;
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
