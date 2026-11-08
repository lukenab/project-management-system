import { Schema, model } from "mongoose";

const commentSchema = new Schema(
  {
    workItemId: {
      type: Schema.Types.ObjectId,
      ref: "WorkItem",
      required: true,
    },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

commentSchema.index({ workItemId: 1, createdAt: 1, _id: 1 });

export default model("Comment", commentSchema);
