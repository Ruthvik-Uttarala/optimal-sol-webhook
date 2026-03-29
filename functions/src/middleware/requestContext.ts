import type { NextFunction, Request, Response } from "express";
import { makeRequestId } from "../utils/request";

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  const headerRequestId = req.header("x-request-id");
  req.context = {
    requestId: headerRequestId || makeRequestId(),
    receivedAtIso: new Date().toISOString()
  };
  next();
}
