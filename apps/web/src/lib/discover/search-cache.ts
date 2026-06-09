/**
 * In-memory + sessionStorage cache for the Discover search.
 *
 * Why: when the user clicks away from /discover to another in-app route,
 * the React component unmounts and the in-flight fetch's results would be
 * lost. This module keeps in-flight promises alive at the module scope and
 * mirrors finalized results to sessionStorage so a fresh mount of /discover
 * can restore the last search without re-fetching or showing an empty page.
 *
 * Cache lifetime: in-memory for the current tab session; sessionStorage
 * survives until the tab closes. A hard refresh clears in-memory but keeps
 * sessionStorage, so we get instant restore-from-disk on F5 too.
 */

import type {
  DiscoverResult, DiscoverSearchResponse,
  DiscoverCompanyResult, DiscoverCompanySearchResponse,
} from "@/types/discover";

export type Mode = "people" | "companies";

type PeopleCacheEntry = {
  mode: "people";
  page: number;
  total: number;
  capped: boolean;
  results: DiscoverResult[];
  ts: number;
  /** Serialized URL the user was on when the search ran — used to restore filters. */
  urlSearch: string;
};

type CompanyCacheEntry = {
  mode: "companies";
  page: number;
  total: number;
  capped: boolean;
  results: DiscoverCompanyResult[];
  ts: number;
  urlSearch: string;
};

export type CacheEntry = PeopleCacheEntry | CompanyCacheEntry;

const SS_LAST = "ld_discover_last_search";
const SS_RESULT_PREFIX = "ld_discover_result:";
// Cap individual cached payloads so we don't blow past the ~5MB sessionStorage budget.
const MAX_SERIALIZED_BYTES = 1_500_000;

// Module-scope in-flight registry — survives component unmount/remount within the same tab.
const inflight = new Map<string, Promise<DiscoverSearchResponse | DiscoverCompanySearchResponse>>();

function readSession<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function writeSession(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(value);
    if (json.length > MAX_SERIALIZED_BYTES) return;
    sessionStorage.setItem(key, json);
  } catch { /* quota exceeded — skip silently */ }
}

/** Build the storage key for a specific (mode, queryString) pair. */
export function cacheKey(mode: Mode, queryString: string): string {
  return `${mode}::${queryString}`;
}

/** Remember the key of the most recently-run search so we can restore on bare /discover. */
export function setLastSearchKey(key: string) {
  writeSession(SS_LAST, { key, ts: Date.now() });
}

export function getLastSearchKey(): string | null {
  const v = readSession<{ key: string; ts: number }>(SS_LAST);
  return v?.key ?? null;
}

export function getCachedResult(key: string): CacheEntry | null {
  return readSession<CacheEntry>(SS_RESULT_PREFIX + key);
}

export function setCachedResult(key: string, entry: CacheEntry) {
  writeSession(SS_RESULT_PREFIX + key, entry);
  setLastSearchKey(key);
}

/** Track an in-flight fetch so a remount waiting on the same params can join it. */
export function registerInflight<T extends DiscoverSearchResponse | DiscoverCompanySearchResponse>(
  key: string, promise: Promise<T>,
): Promise<T> {
  inflight.set(key, promise as Promise<DiscoverSearchResponse | DiscoverCompanySearchResponse>);
  // Auto-clean once resolved/rejected so future calls fetch fresh.
  promise.finally(() => {
    if (inflight.get(key) === (promise as Promise<DiscoverSearchResponse | DiscoverCompanySearchResponse>)) {
      inflight.delete(key);
    }
  });
  return promise;
}

export function getInflight(key: string):
  | Promise<DiscoverSearchResponse | DiscoverCompanySearchResponse>
  | undefined
{
  return inflight.get(key);
}
