import { rpc } from "@stellar/stellar-sdk";
import { getEnv } from "../config/env.js";

export interface StellarConfig {
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  simulatorAccount: string;
}

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export class RpcError extends Error {
  constructor(message: string, public statusCode: number = 502) {
    super(message);
    this.name = "RpcError";
  }
}

export class RpcTimeoutError extends RpcError {
  constructor(message: string = "RPC operation timed out") {
    super(message, 504);
    this.name = "RpcTimeoutError";
  }
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  timeoutMs?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  timeoutMs: 10000
};

export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries, initialDelayMs, timeoutMs } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new RpcTimeoutError()), timeoutMs)
      );

      return await Promise.race([operation(), timeoutPromise]);
    } catch (error) {
      lastError = error as Error;

      // Don't retry validation errors or timeouts (unless we want to retry on timeout)
      if (error instanceof RequestValidationError) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        console.warn(`[rpc] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new RpcError("RPC operation failed after retries");
}

let cachedConfig: StellarConfig | null = null;
let cachedRpcServer: rpc.Server | null = null;

export function loadStellarConfig(): StellarConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const env = getEnv();

  cachedConfig = {
    horizonUrl: env.HORIZON_URL,
    sorobanRpcUrl: env.SOROBAN_RPC_URL,
    networkPassphrase: env.SOROBAN_NETWORK_PASSPHRASE,
    contractId: env.CONTRACT_ID,
    simulatorAccount: env.SIMULATOR_ACCOUNT
  };

  return cachedConfig;
}

export function getStellarRpcServer(): rpc.Server {
  if (cachedRpcServer) {
    return cachedRpcServer;
  }

  const config = loadStellarConfig();
  cachedRpcServer = new rpc.Server(config.sorobanRpcUrl, { allowHttp: true });
  return cachedRpcServer;
}

// ============================================================
//  READ-RESULT CACHE
//  TTL-based in-memory cache for read-only contract simulations.
//  Invalidation rules:
//   - Entries expire after `ttlMs` milliseconds (default 30 s).
//   - Write operations (create, deposit, distribute, lock, etc.)
//     must call `invalidateCache(key)` or `invalidateCacheByPrefix(prefix)`
//     to evict stale entries immediately.
//   - The cache is process-local; it is automatically warm up on the first
//     read after a cold start or after an invalidation.
// ============================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry<unknown>>();

export const READ_CACHE_TTL_MS = 30_000; // 30 seconds default

export function getCached<T>(key: string): T | undefined {
  const entry = _cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    return undefined;
  }
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    console.debug(`[cache] MISS (expired) key=${key}`);
    return undefined;
  }
  console.debug(`[cache] HIT key=${key}`);
  return entry.value;
}

export function setCached<T>(key: string, value: T, ttlMs = READ_CACHE_TTL_MS): void {
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  console.debug(`[cache] SET key=${key} ttl=${ttlMs}ms`);
}

export function invalidateCache(key: string): void {
  const deleted = _cache.delete(key);
  if (deleted) {
    console.debug(`[cache] INVALIDATE key=${key}`);
  }
}

export function invalidateCacheByPrefix(prefix: string): void {
  let count = 0;
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) {
      _cache.delete(key);
      count++;
    }
  }
  if (count > 0) {
    console.debug(`[cache] INVALIDATE prefix=${prefix} removed=${count}`);
  }
}

export function getCacheStats(): { size: number; keys: string[] } {
  return { size: _cache.size, keys: Array.from(_cache.keys()) };
}