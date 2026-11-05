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
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
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
    closeNote: {
      type: String,
      trim: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Validate: End Date > Start Date và tối đa 1 tháng
function validateSprintDuration(doc: any) {
  if (!doc.startDate || !doc.endDate) return true; // DRAFT cho phép null
  if (doc.endDate <= doc.startDate) {
    throw new Error("endDate must be after startDate");
  }

  // --- Validate Sprint kéo dài tối đa 1 tháng ---
  // Sử dụng UTC để đồng nhất múi giờ giữa Server và DB.
  // Xử lý chống trôi ngày (Date Overflow) của JS (VD: 31/01 + 1 tháng -> 03/03).
  // Cách làm: Lưu ngày gốc -> Đưa tạm về mùng 1 -> Cộng 1 tháng -> Set lại ngày gốc nhưng không vượt quá ngày cuối cùng của tháng đích (VD: 31/01 -> 28/02).
  const start = new Date(doc.startDate);
  const maxEnd = new Date(start);
  const day = start.getUTCDate(); // Lưu lại ngày ban đầu
  maxEnd.setUTCDate(1); // Đưa về ngày 1 -> đảm bảo an toàn khi cộng tháng
  maxEnd.setUTCMonth(maxEnd.getUTCMonth() + 1); // Chuyển sang tháng kế tiếp
  const lastDayOfMonth = new Date(
    Date.UTC(maxEnd.getUTCFullYear(), maxEnd.getUTCMonth() + 1, 0),
  ).getUTCDate(); // Lấy ngày tối da của tháng vừa được cộng (Date.UTC(year, month, day) -> truyền day = 0 để lấy ngày cuối cùng của tháng trước đó nên tháng phải là maxEnd.getUTC() + 1)
  maxEnd.setUTCDate(Math.min(day, lastDayOfMonth)); // So sánh ngày ban đầu với ngày tối đa của tháng -> lấy min

  if (doc.endDate > maxEnd) {
    throw new Error("A Sprint can last at most one month");
  }

  return true;
}

sprintSchema.pre("validate", function () {
  // 1. Kiểm tra ngày
  if (this.startDate && this.endDate) {
    validateSprintDuration(this);
  }

  // 2. Chuyển sang ACTIVE phải có đủ ngày
  if (this.status === "ACTIVE") {
    if (!this.startDate || !this.endDate) {
      throw new Error("ACTIVE sprint must have both startDate and endDate");
    }
  }

  // 3. Name không để trống (non-blank)
  if (this.name && this.name.trim().length === 0) {
    throw new Error("Sprint name cannot be blank");
  }
});

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
