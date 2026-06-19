import type { Annotation, Changelog } from '@/src/core/model';

// Cross-machine share brief (SPEC §12): the annotation *model* for a URL, with no
// screenshot. Pure and browser-free — the gzip/base64 transport lives in the
// `src/share` glue layer; this module only builds, fingerprints, and validates the
// envelope. The page is the screenshot, so a recipient who opens the same URL
// re-renders the marks against the live DOM.

export const SHARE_VERSION = 1;
/** Reject obviously-abusive payloads early (a paste, not a bulk import). */
export const MAX_ANNOTATIONS = 1000;

export interface ShareBrief {
  v: typeof SHARE_VERSION;
  url: string;
  title: string;
  capturedAt: number;
  /** Integrity hash over the content fields — detects a truncated/garbled paste. */
  fingerprint: string;
  annotations: Annotation[];
}

/** Why a token failed to validate — surfaced to the user in the popup. */
export type ShareError = 'malformed' | 'version' | 'url' | 'too-large' | 'integrity';

export type ValidateResult = { ok: true; brief: ShareBrief } | { ok: false; reason: ShareError };

interface BriefContent {
  url: string;
  title: string;
  capturedAt: number;
  annotations: Annotation[];
}

// cyrb53 — a small, fast, deterministic non-crypto hash. Used purely for paste
// integrity (a chat client truncating the token), not security.
function cyrb53(input: string): string {
  let h1 = 0xde_ad_be_ef;
  let h2 = 0x41_c6_ce_57;
  for (let i = 0; i < input.length; i++) {
    // charCodeAt returns a defined number for in-range indices; codePointAt is
    // typed `number | undefined` and would force a needless guard in this hot loop.
    // eslint-disable-next-line unicorn/prefer-code-point
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2_654_435_761);
    h2 = Math.imul(h2 ^ ch, 1_597_334_677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
  return (4_294_967_296 * (2_097_151 & h2) + (h1 >>> 0)).toString(36);
}

function fingerprint(content: BriefContent): string {
  return cyrb53(JSON.stringify(content));
}

export function buildBrief(changelog: Changelog): ShareBrief {
  const content: BriefContent = {
    url: changelog.url,
    title: changelog.title,
    capturedAt: changelog.capturedAt,
    annotations: changelog.annotations,
  };
  return { v: SHARE_VERSION, ...content, fingerprint: fingerprint(content) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isAnnotationish(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value['id'] !== 'string' || typeof value['kind'] !== 'string') return false;
  const target = value['target'];
  return isRecord(target) && typeof target['selector'] === 'string';
}

function fail(reason: ShareError): ValidateResult {
  return { ok: false, reason };
}

/**
 * Structurally validate a decoded brief. Never throws — returns a discriminated
 * result so the popup can show the reason. Light by design (the model is large and
 * versioned): enough to reject garbage and a tampered/truncated paste.
 */
export function validateBrief(value: unknown): ValidateResult {
  if (!isRecord(value) || Array.isArray(value)) return fail('malformed');
  if (value['v'] !== SHARE_VERSION) return fail('version');
  const { url, title, capturedAt, annotations, fingerprint: fp } = value;
  if (
    typeof url !== 'string' ||
    typeof title !== 'string' ||
    typeof capturedAt !== 'number' ||
    typeof fp !== 'string'
  )
    return fail('malformed');
  if (!isHttpUrl(url)) return fail('url');
  if (!Array.isArray(annotations)) return fail('malformed');
  if (annotations.length > MAX_ANNOTATIONS) return fail('too-large');
  if (annotations.some((item) => !isAnnotationish(item))) return fail('malformed');
  const content: BriefContent = {
    url,
    title,
    capturedAt,
    annotations: annotations as Annotation[],
  };
  if (fingerprint(content) !== fp) return fail('integrity');
  return { ok: true, brief: { v: SHARE_VERSION, ...content, fingerprint: fp } };
}

// Compare two URLs by host + path + query, ignoring scheme, hash, and a trailing
// slash — so a recipient tab survives an http→https or slash-normalizing redirect.
function normalizeTarget(value: string): string | null {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  } catch {
    return null;
  }
}

export function isSameTarget(a: string, b: string): boolean {
  const na = normalizeTarget(a);
  const nb = normalizeTarget(b);
  return na !== null && na === nb;
}
