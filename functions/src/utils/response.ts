import type { Response } from "express";
import type { ApiErrorBody } from "../types/domain";

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({
    success: true,
    data,
    meta: {
      requestId: res.req.context.requestId,
      timestamp: new Date().toISOString()
    },
    error: null
  });
}

export function sendError(res: Response, statusCode: number, error: ApiErrorBody): void {
  res.status(statusCode).json({
    success: false,
    data: null,
    meta: {
      requestId: res.req.context.requestId,
      timestamp: new Date().toISOString()
    },
    error
  });
}
