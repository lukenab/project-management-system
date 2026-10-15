import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";

const userSchema = new Schema(
  {
    username: {
      type: String,
      minlength: 3,
      required: true,
      unique: true,
    },
    name: String,
    passwordHash: String,
  },
  { timestamps: true },
);

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { _id, __v, passwordHash: _passwordHash, ...user } = ret;
    return {
      id: _id.toString(),
      ...user,
    };
  },
});

export type UserDocument = HydratedDocument<InferSchemaType<typeof userSchema>>;

export default model("User", userSchema);
