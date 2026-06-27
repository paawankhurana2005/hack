// Idempotency rail. A retried stage or a cold-start re-fire must not double-write
// provenance / credits. `stableKey` derives a deterministic key from the request's
// meaningful inputs, so the same logical request always yields the same key.
//
// Implementation note: pure, synchronous FNV-1a over a canonical JSON string — no
// deps, runs identically on client and server. Production swaps this for a UUIDv5
// (namespace + name) without changing call sites; the contract is "same inputs →
// same key".

/** FNV-1a 32-bit hash → 8-char lowercase hex. */
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts (stays within JS number safe range).
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Canonical JSON with sorted keys, so key order never changes the hash. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

/**
 * Deterministic request key from any inputs. `req_<hash>`. Same inputs → same key,
 * regardless of object key order.
 */
export function stableKey(...parts: unknown[]): string {
  return `req_${fnv1a(canonical(parts))}`;
}
