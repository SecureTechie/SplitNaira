import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SplitApp } from "./split-app";
import { ToastProvider } from "./toast-provider";

const mocks = vi.hoisted(() => ({
  mockGetFreighterWalletState: vi.fn(),
  mockConnectFreighter: vi.fn(),
  mockSignWithFreighter: vi.fn(),
  mockGetAllSplits: vi.fn(),
  mockGetClaimable: vi.fn(),
  mockGetSplit: vi.fn(),
  mockGetProjectHistory: vi.fn(),
  mockGetTokenAllowlist: vi.fn(),
  mockBuildLockProjectXdr: vi.fn(),
  mockBuildDistributeXdr: vi.fn(),
  mockBuildCreateSplitXdr: vi.fn(),
  mockBuildDepositXdr: vi.fn(),
  mockBuildAllowTokenXdr: vi.fn(),
  mockBuildDisallowTokenXdr: vi.fn(),
  mockSendTransaction: vi.fn()
}));

vi.mock("@/lib/freighter", () => ({
  getFreighterWalletState: mocks.mockGetFreighterWalletState,
  connectFreighter: mocks.mockConnectFreighter,
  signWithFreighter: mocks.mockSignWithFreighter
}));

vi.mock("@/lib/api", () => ({
  getAllSplits: mocks.mockGetAllSplits,
  getClaimable: mocks.mockGetClaimable,
  getSplit: mocks.mockGetSplit,
  getProjectHistory: mocks.mockGetProjectHistory,
  getTokenAllowlist: mocks.mockGetTokenAllowlist,
  buildLockProjectXdr: mocks.mockBuildLockProjectXdr,
  buildDistributeXdr: mocks.mockBuildDistributeXdr,
  buildCreateSplitXdr: mocks.mockBuildCreateSplitXdr,
  buildDepositXdr: mocks.mockBuildDepositXdr,
  buildAllowTokenXdr: mocks.mockBuildAllowTokenXdr,
  buildDisallowTokenXdr: mocks.mockBuildDisallowTokenXdr
}));

vi.mock("@stellar/stellar-sdk", () => ({
  StrKey: {
    isValidEd25519PublicKey: () => true,
    isValidContract: () => true
  },
  rpc: {
    Server: vi.fn().mockImplementation(() => ({
      sendTransaction: mocks.mockSendTransaction
    }))
  },
  Transaction: vi.fn()
}));

function renderSplitApp() {
  return render(
    <ToastProvider>
      <SplitApp />
    </ToastProvider>
  );
}

const baseProject = {
  projectId: "project_1",
  title: "Project One",
  projectType: "music",
  token: "G_TOKEN",
  owner: "GOWNER123",
  collaborators: [
    { address: "GCOLLAB1", alias: "Lead", basisPoints: 6000 },
    { address: "GCOLLAB2", alias: "Producer", basisPoints: 4000 }
  ],
  locked: false,
  totalDistributed: "0",
  distributionRound: 0,
  balance: "1000"
};

const baseAllowlist = {
  admin: "GOWNER123",
  allowedTokenCount: 1,
  tokens: ["CTOKEN1"],
  start: 0,
  limit: 100
};

async function loadProject() {
  const user = userEvent.setup();
  renderSplitApp();

  await user.click(screen.getByRole("button", { name: "Manage & Distribute" }));
  await user.type(screen.getByPlaceholderText(/Enter Project ID/i), "project_1");
  await user.click(screen.getByRole("button", { name: "Fetch Stats" }));

  await screen.findByText("Project One");
  return user;
}

describe("SplitApp lock project flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetFreighterWalletState.mockResolvedValue({
      connected: true,
      address: "GOWNER123",
      network: "testnet"
    });
    mocks.mockGetAllSplits.mockResolvedValue([]);
    mocks.mockGetClaimable.mockResolvedValue({ claimed: "0", distributionRound: 0 });
    mocks.mockGetProjectHistory.mockResolvedValue({ items: [], nextCursor: null });
    mocks.mockGetTokenAllowlist.mockResolvedValue(baseAllowlist);
    mocks.mockGetSplit.mockResolvedValue(baseProject);
    mocks.mockSignWithFreighter.mockResolvedValue("SIGNED_XDR");
    mocks.mockBuildLockProjectXdr.mockResolvedValue({
      xdr: "LOCK_XDR",
      metadata: { networkPassphrase: "TESTNET", contractId: "CID" }
    });
    mocks.mockBuildDepositXdr.mockResolvedValue({
      xdr: "DEPOSIT_XDR",
      metadata: { networkPassphrase: "TESTNET", contractId: "CID" }
    });
    mocks.mockBuildAllowTokenXdr.mockResolvedValue({
      xdr: "ALLOW_XDR",
      metadata: { networkPassphrase: "TESTNET", contractId: "CID" }
    });
    mocks.mockBuildDisallowTokenXdr.mockResolvedValue({
      xdr: "DISALLOW_XDR",
      metadata: { networkPassphrase: "TESTNET", contractId: "CID" }
    });
    mocks.mockSendTransaction.mockResolvedValue({ status: "PENDING", hash: "HASH_1" });
  });

  it("shows lock button for owner when project is unlocked", async () => {
    await loadProject();
    expect(screen.getByRole("button", { name: "Lock Project" })).toBeInTheDocument();
  });

  it("hides lock button for non-owner", async () => {
    mocks.mockGetFreighterWalletState.mockResolvedValue({
      connected: true,
      address: "GNOTOWNER",
      network: "testnet"
    });

    await loadProject();
    expect(screen.queryByRole("button", { name: "Lock Project" })).not.toBeInTheDocument();
  });

  it("hides lock button and shows locked indicator when already locked", async () => {
    mocks.mockGetSplit.mockResolvedValue({ ...baseProject, locked: true });

    await loadProject();
    expect(screen.queryByRole("button", { name: "Lock Project" })).not.toBeInTheDocument();
    expect(screen.getByText("Split locked - immutable")).toBeInTheDocument();
  });

  it("renders warning text and cancel closes modal without lock action", async () => {
    const user = await loadProject();
    await user.click(screen.getByRole("button", { name: "Lock Project" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This action is permanent and cannot be undone. Once locked, the split configuration can never be changed."
      )
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(mocks.mockBuildLockProjectXdr).not.toHaveBeenCalled();
  });

  it("confirms lock action and disables confirm button while locking", async () => {
    let resolveLock: (() => void) | null = null;
    mocks.mockBuildLockProjectXdr.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLock = () =>
            resolve({
              xdr: "LOCK_XDR",
              metadata: { networkPassphrase: "TESTNET", contractId: "CID" }
            });
        })
    );

    const user = await loadProject();
    await user.click(screen.getByRole("button", { name: "Lock Project" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Lock Project" }));

    expect(within(dialog).getByRole("button", { name: "Locking..." })).toBeDisabled();

    resolveLock?.();
    await waitFor(() => {
      expect(mocks.mockBuildLockProjectXdr).toHaveBeenCalledWith("project_1", "GOWNER123");
    });
  });
});

// ============================================================
//  ISSUE #174 — Owner-gating & Lock Lifecycle UI Tests
// ============================================================

describe("Issue #174: owner gating and lock lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetFreighterWalletState.mockResolvedValue({
      connected: true,
      address: "GOWNER123",
      network: "testnet"
    });
    mocks.mockGetAllSplits.mockResolvedValue([]);
    mocks.mockGetClaimable.mockResolvedValue({ claimed: "0", distributionRound: 0 });
    mocks.mockGetProjectHistory.mockResolvedValue({ items: [], nextCursor: null });
    mocks.mockGetTokenAllowlist.mockResolvedValue(baseAllowlist);
    mocks.mockGetSplit.mockResolvedValue(baseProject);
    mocks.mockSignWithFreighter.mockResolvedValue("SIGNED_XDR");
    mocks.mockBuildLockProjectXdr.mockResolvedValue({
      xdr: "LOCK_XDR",
      metadata: { networkPassphrase: "TESTNET", contractId: "CID" }
    });
    mocks.mockSendTransaction.mockResolvedValue({ status: "PENDING", hash: "LIFECYCLE_HASH" });
  });

  it("non-owner without wallet connection cannot see lock button and sees no locked banner on unlocked project", async () => {
    mocks.mockGetFreighterWalletState.mockResolvedValue({
      connected: false,
      address: null,
      network: null
    });

    await loadProject();
    expect(screen.queryByRole("button", { name: "Lock Project" })).not.toBeInTheDocument();
    expect(screen.queryByText("Split locked - immutable")).not.toBeInTheDocument();
  });

  it("non-owner with wallet connected to a different address cannot lock", async () => {
    mocks.mockGetFreighterWalletState.mockResolvedValue({
      connected: true,
      address: "GATTACKER_NOT_OWNER",
      network: "testnet"
    });

    await loadProject();
    expect(screen.queryByRole("button", { name: "Lock Project" })).not.toBeInTheDocument();
  });

  it("owner sees both lock button AND no locked banner on unlocked project", async () => {
    await loadProject();
    expect(screen.getByRole("button", { name: "Lock Project" })).toBeInTheDocument();
    expect(screen.queryByText("Split locked - immutable")).not.toBeInTheDocument();
    expect(screen.queryByText(/Locked state active/)).not.toBeInTheDocument();
  });

  it("locked project shows both locked-immutable badge and 'Locked state active' secondary message", async () => {
    mocks.mockGetSplit.mockResolvedValue({ ...baseProject, locked: true });

    await loadProject();
    expect(screen.getByText("Split locked - immutable")).toBeInTheDocument();
    expect(screen.getByText(/Locked state active/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lock Project" })).not.toBeInTheDocument();
  });

  it("lifecycle: confirming the lock modal invokes buildLockProjectXdr with owner address and project id", async () => {
    const user = await loadProject();
    expect(screen.getByRole("button", { name: "Lock Project" })).toBeInTheDocument();
    expect(screen.queryByText("Split locked - immutable")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lock Project" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Lock Project" }));

    await waitFor(() => {
      expect(mocks.mockBuildLockProjectXdr).toHaveBeenCalledWith("project_1", "GOWNER123");
    });
    // Owner address is forwarded to the backend so the contract's owner-gating check can reject non-owners.
    expect(mocks.mockBuildLockProjectXdr).toHaveBeenCalledTimes(1);
  });

  it("even a non-owner viewing a locked project sees the locked banner (observer view)", async () => {
    mocks.mockGetFreighterWalletState.mockResolvedValue({
      connected: true,
      address: "GRANDOM_USER",
      network: "testnet"
    });
    mocks.mockGetSplit.mockResolvedValue({ ...baseProject, locked: true });

    await loadProject();
    expect(screen.getByText("Split locked - immutable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lock Project" })).not.toBeInTheDocument();
  });
});

describe("SplitApp admin allowlist flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetFreighterWalletState.mockResolvedValue({
      connected: true,
      address: "GOWNER123",
      network: "testnet"
    });
    mocks.mockGetAllSplits.mockResolvedValue([]);
    mocks.mockGetClaimable.mockResolvedValue({ claimed: "0", distributionRound: 0 });
    mocks.mockGetProjectHistory.mockResolvedValue({ items: [], nextCursor: null });
    mocks.mockGetTokenAllowlist.mockResolvedValue(baseAllowlist);
    mocks.mockGetSplit.mockResolvedValue(baseProject);
    mocks.mockSignWithFreighter.mockResolvedValue("SIGNED_XDR");
    mocks.mockBuildAllowTokenXdr.mockResolvedValue({
      xdr: "ALLOW_XDR",
      metadata: { networkPassphrase: "TESTNET", contractId: "CID" }
    });
    mocks.mockBuildDisallowTokenXdr.mockResolvedValue({
      xdr: "DISALLOW_XDR",
      metadata: { networkPassphrase: "TESTNET", contractId: "CID" }
    });
    mocks.mockSendTransaction.mockResolvedValue({ status: "PENDING", hash: "ALLOWLIST_HASH" });
  });

  it("shows the admin allowlist panel for the configured admin wallet", async () => {
    renderSplitApp();

    expect(await screen.findByText("Admin Token Allowlist")).toBeInTheDocument();
    expect(screen.getByText("CTOKEN1")).toBeInTheDocument();
  });

  it("hides the admin allowlist panel for a non-admin wallet", async () => {
    mocks.mockGetFreighterWalletState.mockResolvedValue({
      connected: true,
      address: "GNOTADMIN",
      network: "testnet"
    });
    mocks.mockGetAllSplits.mockResolvedValue([]);
    mocks.mockGetTokenAllowlist.mockResolvedValue(baseAllowlist);

    renderSplitApp();

    await waitFor(() => {
      expect(screen.queryByText("Admin Token Allowlist")).not.toBeInTheDocument();
    });
  });

  it("submits an allow-token action and refreshes allowlist state", async () => {
    const user = userEvent.setup();
    mocks.mockGetTokenAllowlist
      .mockResolvedValueOnce(baseAllowlist)
      .mockResolvedValueOnce({
        ...baseAllowlist,
        allowedTokenCount: 2,
        tokens: ["CTOKEN1", "CTOKEN2"]
      });

    renderSplitApp();

    await screen.findByText("Admin Token Allowlist");
    await user.type(
      screen.getByLabelText("Token Contract Address"),
      "CTOKEN2"
    );
    await user.click(screen.getByRole("button", { name: "Allow Token" }));

    await waitFor(() => {
      expect(mocks.mockBuildAllowTokenXdr).toHaveBeenCalledWith("GOWNER123", "CTOKEN2");
    });
    await waitFor(() => {
      expect(mocks.mockGetTokenAllowlist).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("CTOKEN2")).toBeInTheDocument();
  });
});

describe("SplitApp distribute flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetFreighterWalletState.mockResolvedValue({
      connected: true,
      address: "GOWNER123",
      network: "testnet"
    });
    mocks.mockGetAllSplits.mockResolvedValue([]);
    mocks.mockGetClaimable.mockResolvedValue({ claimed: "0", distributionRound: 0 });
    mocks.mockGetProjectHistory.mockResolvedValue({ items: [], nextCursor: null });
    mocks.mockGetTokenAllowlist.mockResolvedValue(baseAllowlist);
    mocks.mockGetSplit.mockResolvedValue({ ...baseProject, balance: "5000" });
    mocks.mockSignWithFreighter.mockResolvedValue("SIGNED_XDR");
    mocks.mockBuildDistributeXdr.mockResolvedValue({
      xdr: "DISTRIBUTE_XDR",
      metadata: { networkPassphrase: "TESTNET", contractId: "CID" }
    });
    mocks.mockSendTransaction.mockResolvedValue({ status: "PENDING", hash: "DIST_TX_HASH" });
  });

  it("shows distribute button when project has balance and wallet connected", async () => {
    await loadProject();
    expect(screen.getByRole("button", { name: "Trigger Distribution" })).toBeInTheDocument();
  });

  it("opens distribution modal with Final Confirmation heading", async () => {
    const user = await loadProject();
    await user.click(screen.getByRole("button", { name: "Trigger Distribution" }));

    expect(screen.getByRole("heading", { name: "Final Confirmation" })).toBeInTheDocument();
    expect(screen.getByText(/Splitting/)).toBeInTheDocument();
    expect(screen.getByText("5,000 stroops")).toBeInTheDocument();
  });

  it("shows collaborator payment preview in modal", async () => {
    const user = await loadProject();
    await user.click(screen.getByRole("button", { name: "Trigger Distribution" }));

    const modal = screen.getByRole("heading", { name: "Final Confirmation" }).parentElement;
    expect(within(modal!).getByText("60.00% Share")).toBeInTheDocument();
    expect(within(modal!).getByText("40.00% Share")).toBeInTheDocument();
  });

  it("cancels distribution when cancel button clicked", async () => {
    const user = await loadProject();
    await user.click(screen.getByRole("button", { name: "Trigger Distribution" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Final Confirmation" })).not.toBeInTheDocument();
    });
    expect(mocks.mockBuildDistributeXdr).not.toHaveBeenCalled();
  });

  it("executes distribution and calls buildDistributeXdr", async () => {
    const user = await loadProject();
    await user.click(screen.getByRole("button", { name: "Trigger Distribution" }));
    await user.click(screen.getByRole("button", { name: "Execute Payout" }));

    await waitFor(() => {
      expect(mocks.mockBuildDistributeXdr).toHaveBeenCalledWith("project_1", "GOWNER123");
    });
  });

  it("disables distribute button when wallet not connected", async () => {
    mocks.mockGetFreighterWalletState.mockResolvedValue({
      connected: false,
      address: null,
      network: null
    });

    await loadProject();
    expect(screen.getByRole("button", { name: "Trigger Distribution" })).toBeDisabled();
  });

  it("disables distribute button when balance is zero", async () => {
    mocks.mockGetSplit.mockResolvedValue({ ...baseProject, balance: "0" });

    await loadProject();
    expect(screen.getByRole("button", { name: "Trigger Distribution" })).toBeDisabled();
    expect(screen.getByText("No funds available to distribute")).toBeInTheDocument();
  });
});
