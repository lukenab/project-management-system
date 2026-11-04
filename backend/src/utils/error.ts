export class AppError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AppError";
  }
}

export const createError = (status: number, message: string) => {
  return new AppError(status, message);
};
