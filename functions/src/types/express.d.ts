import type { AuthContext, RequestContext } from "./domain";

declare global {
  namespace Express {
    interface Request {
      params: Record<string, string>;
      context: RequestContext;
      authContext?: AuthContext;
    }
  }
}

export {};
