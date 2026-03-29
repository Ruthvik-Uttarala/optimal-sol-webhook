import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors";
import { sendError } from "../utils/response";
import { ERROR_CODES } from "../config/constants";

export function notFound(_req: Request, res: Response): void {
  sendError(res, 404, {
    code: ERROR_CODES.NOT_FOUND,
    message: "Route not found"
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, { code: err.code, message: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : "Unexpected error";
  sendError(res, 500, {
    code: ERROR_CODES.INTERNAL_ERROR,
    message
  });
}
