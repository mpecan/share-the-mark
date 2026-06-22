import type { ExportPayload } from '@/src/core/export';
import { blobToBase64 } from './base64';

// Channel C (SPEC §13.6): deliver the export to the local daemon that served the
// page. The daemon serves the artifact same-origin, so the brief POSTs to a
// root-relative `/brief` (loopback→loopback — the Chrome 142 LNA-exempt path),
// reshaped to the daemon's BriefIn contract `{ markdown, meta, imageBase64 }`.
// `fetchImpl` is injectable for tests; `local.ts` (the IIFE boot) calls it with the
// real `fetch`. Kept out of the coverage-excluded boot so this logic is tested.

export async function submitBrief(
  payload: ExportPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const imageBase64 = await blobToBase64(payload.image);
  const response = await fetchImpl('/brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown: payload.markdown, meta: payload.meta, imageBase64 }),
  });
  if (!response.ok) {
    throw new Error(`share-the-mark: daemon responded ${String(response.status)}`);
  }
}
