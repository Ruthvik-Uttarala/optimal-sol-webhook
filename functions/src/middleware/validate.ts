import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "../utils/errors";
import { ERROR_CODES } from "../config/constants";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(
        new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          parsed.error.issues[0]?.message || "Invalid payload"
        )
      );
      return;
    }
    req.body = parsed.data;
    next();
  };
}
