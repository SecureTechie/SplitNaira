import type { SplitProject } from "./stellar";
import { getEnv } from "./env";

const API_BASE_URL = getEnv().NEXT_PUBLIC_API_BASE_URL;

export interface CreateSplitPayload {
  owner: string;
  projectId: string;
  title: string;
  projectType: string;
  token: string;
  collaborators: Array<{
    address: string;
    alias: string;
    basisPoints: number;
  }>;
}

export interface ProjectHistoryItem {
  id: string;
  type: "round" | "payment";
  round: number;
  amount: string | number;
  recipient: string;
  ledgerCloseTime: number;
  txHash: string;
}

interface BuildSplitResponse {
  xdr: string;
  metadata: {
    networkPassphrase: string;
    contractId: string;
  };
}

function toErrorMessage(status: number, payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return `${fallback} (status ${status})`;
}

export async function buildCreateSplitXdr(payload: CreateSplitPayload): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to build split transaction"));
  }
  return body as BuildSplitResponse;
}

export async function buildDistributeXdr(projectId: string, sourceAddress: string): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/distribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceAddress })
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to build distribution transaction"));
  }
  return body as BuildSplitResponse;
}

export async function buildLockProjectXdr(projectId: string, owner: string): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner })
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to build lock transaction"));
  }
  return body as BuildSplitResponse;
}

export async function buildDepositXdr(
  projectId: string,
  from: string,
  amount: number
): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, amount })
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to build deposit transaction"));
  }
  return body as BuildSplitResponse;
}

export async function buildUpdateMetadataXdr(
  projectId: string,
  owner: string,
  title: string,
  projectType: string
): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/metadata`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, title, projectType })
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to build metadata update transaction"));
  }
  return body as BuildSplitResponse;
}

export async function buildUpdateCollaboratorsXdr(
  projectId: string,
  owner: string,
  collaborators: Array<{ address: string; alias: string; basisPoints: number }>
): Promise<BuildSplitResponse> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/collaborators`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, collaborators })
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to build collaborators update transaction"));
  }
  return body as BuildSplitResponse;
}

export async function getSplit(projectId: string): Promise<SplitProject> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}`);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to fetch split project"));
  }
  return body as SplitProject;
}

export async function getAllSplits(): Promise<SplitProject[]> {
  const response = await fetch(`${API_BASE_URL}/splits`);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to fetch projects"));
  }
  return body as SplitProject[];
}

export async function getClaimable(projectId: string, address: string): Promise<{ claimed: number; claimable: number }> {
  const response = await fetch(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/claimable/${encodeURIComponent(address)}`);
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(response.status, body, "Failed to fetch claimable info"));
  }
  return body as { claimed: number; claimable: number };
}

export async function getProjectHistory(
  projectId: string,
  cursor?: string
): Promise<{ items: ProjectHistoryItem[]; nextCursor: string | null }> {
  const url = new URL(`${API_BASE_URL}/splits/${encodeURIComponent(projectId)}/history`);
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as unknown;
    throw new Error(toErrorMessage(response.status, body, "Failed to fetch project history"));
  }
  return (await response.json()) as { items: ProjectHistoryItem[]; nextCursor: string | null };
}