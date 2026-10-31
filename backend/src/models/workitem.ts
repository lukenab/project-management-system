import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";

const workitemSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "WorkItem",
    },
    sprintId: {
      type: Schema.Types.ObjectId,
      ref: "Sprint",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    workType: {
      type: String,
      enum: ["STORY", "TASK", "BUG"],
      default: "TASK",
      required: true,
    },
    status: {
      type: String,
      enum: ["TODO", "IN_PROGRESS", "DONE"],
      default: "TODO",
      required: true,
    },
    assigneeId: {
      type: Schema.Types.ObjectId,
      ref: "ProjectMembership",
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", null],
      default: function (this) {
        return this.parentId ? null : "MEDIUM";
      },
    },
    startDate: {
      type: String,
    },
    dueDate: {
      type: String,
    },
    orderIndex: {
      type: Number,
      min: 0,
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    deletedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

workitemSchema.pre("validate", function () {
  // 1. Title không được trống
  if (this.title && this.title.trim().length === 0) {
    return new Error("Title cannot be blank");
  }

  // 2. Self-parenting
  if (this.parentId && this._id && this.parentId.equals(this._id)) {
    return new Error("A WorkItem cannot be its own parent");
  }

  // 3. Subtask
  if (this.parentId) {
    if (this.workType !== "TASK") {
      return new Error("Child work item workType must be TASK");
    }

    if (this.priority != null) {
      this.priority = null;
    }

    if (this.startDate || this.dueDate) {
      return new Error("Child work item cannot have startDate or dueDate");
    }
    if (this.sprintId) {
      return new Error("Child work item cannot store sprintId directly");
    }
  }

  // 4. Quy tắc cho INDEPENDENT WorkItem
  if (!this.parentId) {
    // Dịnh dạng date (YYYY-MM-DD)
    if (this.startDate && !DATE_REGEX.test(this.startDate)) {
      return new Error("startDate must follow format YYYY-MM_DD");
    }
    if (this.dueDate && !DATE_REGEX.test(this.dueDate)) {
      return new Error("dueDate must follow format YYYY-MM-DD");
    }

    // Validate dueDate >= startDate
    if (this.startDate && this.dueDate && this.dueDate < this.startDate) {
      return new Error("dueDate cannot be before startDate");
    }
  }
});

workitemSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { _id, __v, ...workitem } = ret;
    return {
      id: _id.toString(),
      ...workitem,
    };
  },
});

export type WorkItemDocument = HydratedDocument<
  InferSchemaType<typeof workitemSchema>
>;

export default model("WorkItem", workitemSchema);
