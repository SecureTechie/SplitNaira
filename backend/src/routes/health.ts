import { Router } from "express";
import { loadStellarConfig } from "../services/stellar.js";

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
  try {
    loadStellarConfig();
    res.json({
      status: "ready"
    });
  } catch {
    const requestId = res.locals.requestId;
    res.status(503).json({
      status: "not_ready",
      error: "missing_config",
      message: "Required Stellar environment variables are missing.",
      requestId
    });
  }
});