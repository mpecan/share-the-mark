import type { ExportPayload } from '@/src/core/export';

// Channel C (SPEC §13.6): deliver the export to the local daemon that served the
// page. The daemon serves the artifact same-origin, so the brief POSTs to a
// root-relative `/brief` (loopback→loopback — the Chrome 142 LNA-exempt path),
// reshaped to the daemon's BriefIn contract `{ markdown, meta, imageBase64 }`.
// `fetchImpl` is injectable for tests; `local.ts` (the IIFE boot) calls it with the
// real `fetch`. Kept out of the coverage-excluded boot so this logic is tested.

// Base64 of the PNG via FileReader (the same idiom as src/embed/standalone.ts;
// duplicated rather than imported — the alternatives pull the message bus or live
// in a coverage-excluded entry).
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      // readAsDataURL yields `data:<type>;base64,<payload>` — keep the payload.
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('failed to read image'));
    });
    reader.readAsDataURL(blob);
  });
}

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
