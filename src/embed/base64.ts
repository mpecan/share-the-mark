// Base64 (no `data:` prefix) of a Blob via FileReader — the browser-side idiom
// shared by the embed channel entries (standalone.ts, local-submit.ts). Pure data
// plumbing with no message-bus coupling, so it lives here in src/embed; the copy in
// src/capture/daemon-sink.ts stays separate (that module is behind the message bus,
// which must not be pulled into the embed bundle).
export function blobToBase64(blob: Blob): Promise<string> {
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
