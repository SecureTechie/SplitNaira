import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { app } from "../index.js";

vi.mock("../services/stellar.js", () => {
  class RequestValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "RequestValidationError";
    }
  }
  return {
    loadStellarConfig: vi.fn(() => ({
      horizonUrl: "http://horizon",
      sorobanRpcUrl: "http://rpc",
      networkPassphrase: "test",
      contractId: "test_contract",
      simulatorAccount: "test_account"
    })),
    getStellarRpcServer: vi.fn(() => ({
      getAccount: vi.fn().mockResolvedValue({}),
      simulateTransaction: vi.fn().mockResolvedValue({ result: { retval: null } }),
      prepareTransaction: vi.fn().mockResolvedValue({
        toXDR: () => "test_xdr",
        sequence: "1",
        fee: "100"
      }),
      getEvents: vi.fn().mockResolvedValue({ events: [] })
    })),
    RequestValidationError
  };
});

describe("Route Integration Tests", () => {
  describe("GET /", () => {
    it("should return API info", async () => {
      const res = await request(app).get("/");
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("SplitNaira API");
    });
  });

  describe("GET /health", () => {
    it("should return 200 and ok status", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });
  });

  describe("GET /splits", () => {
    it("should return validation error when simulator account is unavailable", async () => {
      const res = await request(app).get("/splits");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("validation_error");
    });
  });

  describe("Error Handling & Request ID", () => {
    it("should propagate request-id in internal error responses", async () => {
      const res = await request(app)
        .get("/splits/invalid-project-id!!!")
        .set("x-request-id", "test-request-id");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("internal_error");
      expect(res.headers["x-request-id"]).toBe("test-request-id");
      expect(res.body.requestId).toBe("test-request-id");
    });

    it("should return 404 for unknown routes", async () => {
      const res = await request(app).get("/unknown-route");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("not_found");
    });
  });
});
