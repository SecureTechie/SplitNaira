import { z } from "zod";

// ── Shared primitives ────────────────────────────────────────────────────────

export const AccountIdSchema = z.string().regex(/^G[A-Z2-7]{55}$/, {
  message: "Must be a valid Stellar account ID (G…)",
});

export const CollaboratorSchema = z.object({
  address: AccountIdSchema,
  share: z.number().int().min(0).max(10_000),
});

// ── Project ──────────────────────────────────────────────────────────────────

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: AccountIdSchema,
  collaborators: z.array(CollaboratorSchema),
  totalReceived: z.string(), // stroops as string to avoid JS int overflow
  claimable: z.string(),
  createdAt: z.number().int(),
});

export type Project = z.infer<typeof ProjectSchema>;

// ── Project list ─────────────────────────────────────────────────────────────

export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectSchema),
  total: z.number().int().nonnegative(),
});

export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

// ── Project IDs (lightweight discovery) ─────────────────────────────────────

export const ProjectIdsResponseSchema = z.object({
  ids: z.array(z.string()),
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export type ProjectIdsResponse = z.infer<typeof ProjectIdsResponseSchema>;

// ── History ──────────────────────────────────────────────────────────────────

export const HistoryEntrySchema = z.object({
  txHash: z.string(),
  amount: z.string(),
  recipient: AccountIdSchema,
  timestamp: z.number().int(),
  ledger: z.number().int().nonnegative(),
});

export const HistoryResponseSchema = z.object({
  entries: z.array(HistoryEntrySchema),
  total: z.number().int().nonnegative(),
});

export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

// ── Unsigned XDR ─────────────────────────────────────────────────────────────

export const UnsignedXdrResponseSchema = z.object({
  xdr: z.string().min(1),
  fee: z.string(),
  sequence: z.string(),
  operations: z.number().int().positive(),
});

export type UnsignedXdrResponse = z.infer<typeof UnsignedXdrResponseSchema>;

// ── Error envelope ───────────────────────────────────────────────────────────

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});
