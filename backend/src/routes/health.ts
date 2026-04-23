import { Router } from "express";
import { getEnvDiagnostics } from "../config/env.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

healthRouter.get("/live", (_req, res) => {
  res.json({
    status: "ok"
  });
});

healthRouter.get("/ready", (_req, res) => {
  const diagnostics = getEnvDiagnostics();

  if (!diagnostics.ok) {
    const requestId = res.locals.requestId;
    res.status(503).json({
      status: "not_ready",
      error: "missing_config",
      message: "Required environment variables are missing or malformed.",
      issues: diagnostics.issues,
      requestId
    });
    return;
  }

  res.json({ status: "ready" });
});