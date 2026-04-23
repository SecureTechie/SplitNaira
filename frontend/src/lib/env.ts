import { z } from "zod";

/**
 * Schema for all NEXT_PUBLIC_* environment variables consumed by the frontend.
 * Every field has a sensible default so development works out-of-the-box after
 * copying .env.example.  Values that look malformed (e.g. a non-URL string
 * where a URL is expected) cause an immediate, descriptive error at startup.
 */
const frontendEnvSchema = z.object({
  NEXT_PUBLIC_STELLAR_NETWORK: z
    .enum(["testnet", "mainnet"], {
      errorMap: () => ({
        message:
          'NEXT_PUBLIC_STELLAR_NETWORK must be "testnet" or "mainnet"'
      })
    })
    .default("testnet"),

  NEXT_PUBLIC_SOROBAN_RPC_URL: z
    .string()
    .url(
      "NEXT_PUBLIC_SOROBAN_RPC_URL must be a valid URL, e.g. https://soroban-testnet.stellar.org"
    )
    .default("https://soroban-testnet.stellar.org"),

  NEXT_PUBLIC_HORIZON_URL: z
    .string()
    .url(
      "NEXT_PUBLIC_HORIZON_URL must be a valid URL, e.g. https://horizon-testnet.stellar.org"
    )
    .default("https://horizon-testnet.stellar.org"),

  NEXT_PUBLIC_API_BASE_URL: z
    .string()
    .url(
      "NEXT_PUBLIC_API_BASE_URL must be a valid URL, e.g. http://localhost:3001"
    )
    .default("http://localhost:3001"),

  /**
   * The deployed Soroban contract address.  Left optional here because the app
   * can still render pages that don't require contract interaction; however a
   * missing value is surfaced by printEnvDiagnostics() so contributors know to
   * fill it in before attempting on-chain operations.
   */
  NEXT_PUBLIC_CONTRACT_ID: z.string().optional().default("")
});

export type FrontendEnv = z.infer<typeof frontendEnvSchema>;

/**
 * Reads the current `process.env` snapshot (Next.js statically inlines
 * NEXT_PUBLIC_* values at build time) and validates it against the schema.
 * Throws with a developer-friendly diagnostic on the first invalid configuration
 * so misconfiguration is caught at startup rather than buried in a runtime error.
 */
export function validateEnv(): FrontendEnv {
  const result = frontendEnvSchema.safeParse({
    NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
    NEXT_PUBLIC_SOROBAN_RPC_URL: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL,
    NEXT_PUBLIC_HORIZON_URL: process.env.NEXT_PUBLIC_HORIZON_URL,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_CONTRACT_ID: process.env.NEXT_PUBLIC_CONTRACT_ID
  });

  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "unknown";
      return `  ✗  ${key}: ${issue.message}`;
    });

    throw new Error(
      [
        "[env] Frontend misconfigured — fix the following environment variable issues:",
        ...lines,
        "",
        "Copy frontend/.env.example to frontend/.env and update the values."
      ].join("\n")
    );
  }

  if (!result.data.NEXT_PUBLIC_CONTRACT_ID) {
    console.warn(
      "[env] NEXT_PUBLIC_CONTRACT_ID is not set — on-chain operations will fail. " +
        "Deploy the Soroban contract and add its address to frontend/.env."
    );
  }

  return result.data;
}

let cachedEnv: FrontendEnv | null = null;

/**
 * Returns the validated frontend env config, memoised after the first call.
 * Import and call this wherever you need an env var instead of reading
 * `process.env` directly.
 */
export function getEnv(): FrontendEnv {
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
