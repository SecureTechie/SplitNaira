export type StellarNetwork = "testnet" | "mainnet";

export interface SplitProject {
  projectId: string;
  title: string;
  projectType: string;
  token: string;
  owner: string;
  collaborators: Array<{
    address: string;
    alias: string;
    basisPoints: number;
  }>;
  locked: boolean;
  totalDistributed: string;
  distributionRound: number;
  balance: string;
}

export function getHorizonUrl(network: StellarNetwork) {
  return network === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";
}

export function formatBasisPoints(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}