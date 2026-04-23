import express from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { splitsRouter } from "./splits.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { errorHandler, notFoundHandler } from "../middleware/error.js";

const getAccountMock = vi.fn();
const prepareTransactionMock = vi.fn();
const simulateTransactionMock = vi.fn();
const getEventsMock = vi.fn();

const serverMock = {
  getAccount: getAccountMock,
  prepareTransaction: prepareTransactionMock,
  simulateTransaction: simulateTransactionMock,
  getEvents: getEventsMock
};

vi.mock("@stellar/stellar-sdk", () => {
  class ScMapEntry {
    key: unknown;
    val: unknown;
    constructor({ key, val }: { key: unknown; val: unknown }) {
      this.key = key;
      this.val = val;
    }
  }

  return {
    Address: {
      fromString: vi.fn((address: string) => ({
        toScVal: () => ({ address })
      }))
    },
    BASE_FEE: 100,
    Contract: vi.fn().mockImplementation(() => ({
      call: (method: string, ...args: unknown[]) => ({ method, args })
    })),
    TransactionBuilder: vi.fn().mockImplementation(() => ({
      addOperation: function (op: unknown) {
        this.op = op;
        return this;
      },
      setTimeout: function () {
        return this;
      },
      build: function () {
        return { preparedOperation: this.op };
      }
    })),
    nativeToScVal: vi.fn((value: unknown) => value),
    scValToNative: vi.fn((value: unknown) => value),
    rpc: {
      Server: vi.fn(() => serverMock)
    },
    xdr: {
      ScVal: {
        scvMap: (items: unknown[]) => items,
        scvU32: (value: number) => value,
        scvVec: (items: unknown[]) => items
      },
      ScMapEntry
    }
  };
});

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use("/splits", splitsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

beforeAll(() => {
  process.env.HORIZON_URL = "https://horizon.test";
  process.env.SOROBAN_RPC_URL = "https://soroban.test";
  process.env.SOROBAN_NETWORK_PASSPHRASE = "Test SDF Network";
  process.env.CONTRACT_ID = "TESTCONTRACT";
  process.env.SIMULATOR_ACCOUNT = "GTESTSIMULATOR";
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("splits routes integration", () => {
  it("creates a split project", async () => {
    getAccountMock.mockResolvedValue({ accountId: "GOWNER" });
    prepareTransactionMock.mockResolvedValue({
      toXDR: () => "XDR_CREATE",
      sequence: "123",
      fee: "100"
    });

    const app = createApp();

    const createPayload = {
      owner: "GOWNER",
      projectId: "project_1",
      title: "Project 1",
      projectType: "token",
      token: "GTOKENADDRESS",
      collaborators: [
        { address: "GCOLLAB1", alias: "A", basisPoints: 5000 },
        { address: "GCOLLAB2", alias: "B", basisPoints: 5000 }
      ]
    };

    const response = await request(app).post("/splits").send(createPayload).expect(200);

    expect(response.body).toMatchObject({
      xdr: "XDR_CREATE",
      metadata: {
        contractId: "TESTCONTRACT",
        networkPassphrase: "Test SDF Network",
        sourceAccount: "GOWNER",
        operation: "create_project"
      }
    });

    expect(getAccountMock).toHaveBeenCalledWith("GOWNER");
  });

  it("locks a split project", async () => {
    getAccountMock.mockResolvedValue({ accountId: "GOWNER" });
    prepareTransactionMock.mockResolvedValue({
      toXDR: () => "XDR_LOCK",
      sequence: "456",
      fee: "100"
    });

    const app = createApp();

    const response = await request(app)
      .post("/splits/project_1/lock")
      .send({ owner: "GOWNER" })
      .expect(200);

    expect(response.body).toMatchObject({
      xdr: "XDR_LOCK",
      metadata: {
        operation: "lock_project",
        sourceAccount: "GOWNER"
      }
    });

    expect(getAccountMock).toHaveBeenCalledWith("GOWNER");
  });

  it("builds distribute transaction", async () => {
    getAccountMock.mockResolvedValue({ accountId: "GDISP" });
    prepareTransactionMock.mockResolvedValue({
      toXDR: () => "XDR_DISTRIBUTE",
      sequence: "789",
      fee: "100"
    });

    const app = createApp();

    const response = await request(app)
      .post("/splits/project_1/distribute")
      .send({ sourceAddress: "GDISP" })
      .expect(200);

    expect(response.body).toMatchObject({
      xdr: "XDR_DISTRIBUTE",
      metadata: {
        operation: "distribute",
        sourceAccount: "GDISP"
      }
    });

    expect(getAccountMock).toHaveBeenCalledWith("GDISP");
  });

  it("lists split projects", async () => {
    getAccountMock.mockResolvedValue({ accountId: "GSIM" });
    simulateTransactionMock.mockResolvedValue({
      result: {
        retval: [
          { projectId: "project_1" },
          { projectId: "project_2" }
        ]
      }
    });

    const app = createApp();

    const response = await request(app).get("/splits?start=0&limit=10").expect(200);

    expect(response.body).toEqual([
      { projectId: "project_1" },
      { projectId: "project_2" }
    ]);

    expect(getAccountMock).toHaveBeenCalledWith("GTESTSIMULATOR");
  });

  it("fetches a project by id", async () => {
    getAccountMock.mockResolvedValue({ accountId: "GSIM" });
    simulateTransactionMock.mockResolvedValue({
      result: {
        retval: { projectId: "project_1", title: "Project 1" }
      }
    });

    const app = createApp();

    const response = await request(app).get("/splits/project_1").expect(200);

    expect(response.body).toEqual({ projectId: "project_1", title: "Project 1" });
    expect(getAccountMock).toHaveBeenCalledWith("GTESTSIMULATOR");
  });

  it("builds allow_token transaction", async () => {
    getAccountMock.mockResolvedValue({ accountId: "GADMIN" });
    prepareTransactionMock.mockResolvedValue({
      toXDR: () => "XDR_ALLOW_TOKEN",
      sequence: "100",
      fee: "100"
    });

    const app = createApp();

    const response = await request(app)
      .post("/splits/admin/allow-token")
      .send({ admin: "GADMIN", token: "GTOKEN" })
      .expect(200);

    expect(response.body).toMatchObject({
      xdr: "XDR_ALLOW_TOKEN",
      metadata: {
        contractId: "TESTCONTRACT",
        networkPassphrase: "Test SDF Network",
        sourceAccount: "GADMIN",
        operation: "allow_token"
      }
    });

    expect(getAccountMock).toHaveBeenCalledWith("GADMIN");
  });

  it("builds disallow_token transaction", async () => {
    getAccountMock.mockResolvedValue({ accountId: "GADMIN" });
    prepareTransactionMock.mockResolvedValue({
      toXDR: () => "XDR_DISALLOW_TOKEN",
      sequence: "101",
      fee: "100"
    });

    const app = createApp();

    const response = await request(app)
      .post("/splits/admin/disallow-token")
      .send({ admin: "GADMIN", token: "GTOKEN" })
      .expect(200);

    expect(response.body).toMatchObject({
      xdr: "XDR_DISALLOW_TOKEN",
      metadata: {
        contractId: "TESTCONTRACT",
        networkPassphrase: "Test SDF Network",
        sourceAccount: "GADMIN",
        operation: "disallow_token"
      }
    });

    expect(getAccountMock).toHaveBeenCalledWith("GADMIN");
  });

  it("returns 400 for allow_token with missing fields", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/splits/admin/allow-token")
      .send({ admin: "GADMIN" }) // missing token
      .expect(400);

    expect(response.body.error).toBe("validation_error");
  });

  it("returns 400 for disallow_token with missing fields", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/splits/admin/disallow-token")
      .send({ token: "GTOKEN" }) // missing admin
      .expect(400);

    expect(response.body.error).toBe("validation_error");
  });

  it("returns 400 for allow_token when admin account not found", async () => {
    getAccountMock.mockRejectedValue(new Error("not found"));

    const app = createApp();

    const response = await request(app)
      .post("/splits/admin/allow-token")
      .send({ admin: "GADMIN", token: "GTOKEN" })
      .expect(400);

    expect(response.body.error).toBe("validation_error");
    expect(response.body.message).toMatch(/admin account not found/);
  });

  it("returns 400 for disallow_token when admin account not found", async () => {
    getAccountMock.mockRejectedValue(new Error("not found"));

    const app = createApp();

    const response = await request(app)
      .post("/splits/admin/disallow-token")
      .send({ admin: "GADMIN", token: "GTOKEN" })
      .expect(400);

    expect(response.body.error).toBe("validation_error");
    expect(response.body.message).toMatch(/admin account not found/);
  });

  it("retrieves history filtered and sorted", async () => {
    getAccountMock.mockResolvedValue({ accountId: "GSIM" });

    getEventsMock
      .mockResolvedValueOnce({
        events: [
          {
            value: [2, 100],
            txHash: "TX2",
            ledgerClosedAt: "2025-01-02T00:00:00Z",
            id: "round-2"
          }
        ]
      })
      .mockResolvedValueOnce({
        events: [
          {
            value: ["GUSER", 50],
            txHash: "TX1",
            ledgerClosedAt: "2025-01-01T00:00:00Z",
            id: "payment-1"
          }
        ]
      });

    const app = createApp();

    const response = await request(app).get("/splits/project_1/history").expect(200);

    expect(response.body).toEqual([
      {
        type: "round",
        round: 2,
        amount: "100",
        txHash: "TX2",
        ledgerCloseTime: "2025-01-02T00:00:00Z",
        id: "round-2"
      },
      {
        type: "payment",
        recipient: "GUSER",
        amount: "50",
        txHash: "TX1",
        ledgerCloseTime: "2025-01-01T00:00:00Z",
        id: "payment-1"
      }
    ]);

    expect(getEventsMock).toHaveBeenCalledTimes(2);
  });
});
