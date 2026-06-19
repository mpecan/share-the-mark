import { validateBrief, type ShareBrief, type ValidateResult } from '@/src/core/share';

// Transport for a share brief (SPEC §12.1): gzip + base64url behind a `stm1:`
// magic prefix, using the native CompressionStream so there's no dependency and
// the size budget is unaffected. The TextQuote context in anchors compresses well.

export const TOKEN_PREFIX = 'stm1:';
// A paste, not a file: bound the input so a pathological token can't tie us up.
const MAX_TOKEN_CHARS = 1_000_000;

async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/* eslint-disable unicorn/prefer-uint8array-base64, unicorn/prefer-code-point --
   Uint8Array.toBase64/fromBase64 aren't in our Node 22 toolchain or all target
   browsers yet; btoa/atob over a binary string is the portable encoding. */
function toBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
/* eslint-enable unicorn/prefer-uint8array-base64, unicorn/prefer-code-point */

export async function encodeToken(brief: ShareBrief): Promise<string> {
  return TOKEN_PREFIX + toBase64Url(await gzip(JSON.stringify(brief)));
}

// Never throws — a garbled paste (bad prefix, base64, gzip, or JSON) is reported
// as 'malformed'; structural problems come from validateBrief.
export async function decodeToken(token: string): Promise<ValidateResult> {
  const trimmed = token.trim();
  if (!trimmed.startsWith(TOKEN_PREFIX) || trimmed.length > MAX_TOKEN_CHARS)
    return { ok: false, reason: 'malformed' };
  try {
    const json = await gunzip(fromBase64Url(trimmed.slice(TOKEN_PREFIX.length)));
    return validateBrief(JSON.parse(json) as unknown);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}
