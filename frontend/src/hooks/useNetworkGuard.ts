"use client";

import { useMemo } from "react";
import type { WalletState } from "../lib/freighter";
import { getEnv } from "../lib/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NetworkMismatchSeverity = "error" | "warning" | "ok";

export interface NetworkGuardResult {
  /** True when Freighter's network differs from NEXT_PUBLIC_STELLAR_NETWORK */
  mismatch: boolean;
  severity: NetworkMismatchSeverity;
  /** The network configured in env */
  expectedNetwork: string;
  /** The network Freighter is currently on (null if wallet not connected) */
  actualNetwork: string | null;
  /** Human-readable message suitable for a toast or banner */
  message: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise network strings so "TESTNET" and "testnet" both match.
 * Freighter returns e.g. "TESTNET" | "PUBLIC" | "FUTURENET" | "STANDALONE".
 * The env var is typically lowercase: "testnet" | "mainnet" | "public".
 */
function normalise(network: string): string {
  const n = network.toLowerCase().trim();
  // Freighter uses "PUBLIC" for mainnet; env vars often say "mainnet"
  if (n === "mainnet") return "public";
  return n;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Compares `wallet.network` (from Freighter) against the configured env var.
 *
 * @example
 * const { mismatch, message } = useNetworkGuard(wallet);
 * if (mismatch) return <NetworkWarningBanner message={message} />;
 */
export function useNetworkGuard(wallet: WalletState): NetworkGuardResult {
  const expectedNetwork = getEnv().NEXT_PUBLIC_STELLAR_NETWORK;

  return useMemo<NetworkGuardResult>(() => {
    // If the wallet is not connected there is nothing to compare yet
    if (!wallet.connected || !wallet.network) {
      return {
        mismatch: false,
        severity: "ok",
        expectedNetwork,
        actualNetwork: null,
        message: "",
      };
    }

    const actual = wallet.network;
    const mismatch = normalise(actual) !== normalise(expectedNetwork);

    if (!mismatch) {
      return {
        mismatch: false,
        severity: "ok",
        expectedNetwork,
        actualNetwork: actual,
        message: "",
      };
    }

    return {
      mismatch: true,
      severity: "error",
      expectedNetwork,
      actualNetwork: actual,
      message:
        `Wrong network detected. Freighter is on "${actual}" but this app ` +
        `requires "${expectedNetwork}". Please switch networks in Freighter and refresh.`,
    };
  }, [wallet.connected, wallet.network, expectedNetwork]);
}
