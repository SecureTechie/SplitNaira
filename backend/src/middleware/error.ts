import type { NextFunction, Request, Response } from "express";

import { RpcError } from "../services/stellar.js";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: "not_found",
    message: "Route not found.",
    requestId: res.locals.requestId
  });
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = res.locals.requestId;
  console.error({ requestId, err: err.stack || err.message || err });

  if (err instanceof RpcError) {
    return res.status(err.statusCode).json({
      error: "rpc_error",
      message: err.message,
      requestId
    });
  }

  res.status(500).json({
    error: "internal_error",
    message: err.message || "Unexpected server error.",
    requestId
  });
}
