import { z } from "zod";

/**
 * Zod schema covering every environment variable the backend reads.
 * Required fields include an explicit `required_error` to tell contributors
 * exactly what to do, not just that something is wrong.
 */
const backendEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z
    .string()
    .optional()
    .default("3001")
    .refine((val) => {
      const n = Number(val);
      return Number.isInteger(n) && n >= 1 && n <= 65535;
    }, "PORT must be a valid port number between 1 and 65535"),

  CORS_ORIGIN: z.string().optional(),

  HORIZON_URL: z
    .string({
      required_error:
        "HORIZON_URL is required — set it to the Stellar Horizon endpoint, e.g. https://horizon-testnet.stellar.org"
    })
    .min(1, "HORIZON_URL must not be empty")
    .url("HORIZON_URL must be a valid URL, e.g. https://horizon-testnet.stellar.org"),

  SOROBAN_RPC_URL: z
    .string({
      required_error:
        "SOROBAN_RPC_URL is required — set it to the Soroban RPC endpoint, e.g. https://soroban-testnet.stellar.org"
    })
    .min(1, "SOROBAN_RPC_URL must not be empty")
    .url("SOROBAN_RPC_URL must be a valid URL, e.g. https://soroban-testnet.stellar.org"),

  SOROBAN_NETWORK_PASSPHRASE: z
    .string({
      required_error:
        'SOROBAN_NETWORK_PASSPHRASE is required — for testnet use "Test SDF Network ; September 2015"'
    })
    .min(1, "SOROBAN_NETWORK_PASSPHRASE must not be empty"),

  CONTRACT_ID: z
    .string({
      required_error:
        "CONTRACT_ID is required — deploy the Soroban contract and paste the resulting contract address here"
    })
    .min(1, "CONTRACT_ID must not be empty — deploy the Soroban contract first"),

  SIMULATOR_ACCOUNT: z
    .string({
      required_error:
        "SIMULATOR_ACCOUNT is required — provide a funded Stellar account public key used to simulate transactions"
    })
    .min(1, "SIMULATOR_ACCOUNT must not be empty"),

  RATE_LIMIT_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_MAX: z.string().optional(),
  SHUTDOWN_FORCE_TIMEOUT_MS: z.string().optional()
});

export type BackendEnv = z.infer<typeof backendEnvSchema>;

/**
 * Validates `process.env` against the backend schema and returns the typed
 * result. Throws with a human-readable diagnostic listing every missing or
 * malformed variable so contributors can fix things without reading stack traces.
 */
export function validateEnv(): BackendEnv {
  const result = backendEnvSchema.safeParse(process.env);

  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "unknown";
      return `  ✗  ${key}: ${issue.message}`;
    });

    throw new Error(
      [
        "[env] Server cannot start — fix the following environment variable issues:",
        ...lines,
        "",
        "Copy backend/.env.example to backend/.env and fill in the missing values."
      ].join("\n")
    );
  }

  return result.data;
}

let cachedEnv: BackendEnv | null = null;

/**
 * Returns the validated env config. Result is memoised after the first call
 * so subsequent lookups are just a null-check.
 */
export function getEnv(): BackendEnv {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}

/**
 * Clears the memoised env so the next `getEnv()` call re-validates.
 * Intended for use in tests only.
 */
export function clearEnvCache(): void {
  cachedEnv = null;
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

export interface EnvIssue {
  key: string;
  message: string;
}

export type EnvDiagnosticsResult =
  | { ok: true }
  | { ok: false; issues: EnvIssue[] };

/**
 * Non-throwing variant of `validateEnv`.  Returns a structured result that
 * callers (e.g. the `/health/ready` endpoint) can inspect without wrapping in
 * a try/catch.
 */
export function getEnvDiagnostics(): EnvDiagnosticsResult {
  const result = backendEnvSchema.safeParse(process.env);

  if (result.success) {
    return { ok: true };
  }

  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      key: issue.path.join(".") || "unknown",
      message: issue.message
    }))
  };
}

/**
 * Prints a human-readable env summary to stdout — useful during local dev
 * and container startup to spot missing configuration quickly.
 * Actual values are truncated so secrets don't end up in log aggregators.
 */
export function printEnvDiagnostics(): void {
  const vars: Array<{ key: string; required: boolean }> = [
    { key: "NODE_ENV", required: false },
    { key: "PORT", required: false },
    { key: "CORS_ORIGIN", required: false },
    { key: "HORIZON_URL", required: true },
    { key: "SOROBAN_RPC_URL", required: true },
    { key: "SOROBAN_NETWORK_PASSPHRASE", required: true },
    { key: "CONTRACT_ID", required: true },
    { key: "SIMULATOR_ACCOUNT", required: true }
  ];

  console.log("[env] Environment diagnostics:");

  for (const { key, required } of vars) {
    const raw = process.env[key];
    const present = raw !== undefined && raw.trim().length > 0;

    let marker: string;
    if (present) {
      marker = "✓";
    } else if (required) {
      marker = "✗  MISSING";
    } else {
      marker = "—  (default)";
    }

    const display = present ? ` = ${truncate(raw!)}` : "";
    console.log(`  ${marker}  ${key}${display}`);
  }
}

function truncate(value: string, max = 48): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
