if (process.env.NODE_ENV !== "production") {
  import("dotenv")
    .then((dotenv) => {
      dotenv.config();
    })
    .catch((err) => {
      throw new Error("loading environment variables failed:", err);
    });
}

const PORT = process.env.PORT;
const MONGODB_URI =
  process.env.NODE_ENV === "production"
    ? process.env.MONGODB_URI
    : process.env.TEST_MONGODB_URI;

export { PORT, MONGODB_URI };
