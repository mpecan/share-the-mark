import { readdirSync, readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

// Upload a new package to the Chrome Web Store item using a Google Cloud SERVICE
// ACCOUNT (JSON key) — not the legacy per-user OAuth refresh-token flow (which the
// `wxt submit` / publish-extension tool is limited to). The service account is added
// under the CWS Developer Dashboard → Account (one SA per publisher).
//
// Upload-only by default: the new version lands as a DRAFT in the dashboard and we
// never call `/publish`, so nothing ships to users until you publish it there
// (matches the pipeline's upload-only choice). Set CHROME_PUBLISH=true to also publish.
//
// Env:
//   CHROME_EXTENSION_ID         the item id (required)
//   CHROME_SERVICE_ACCOUNT_KEY  the service-account JSON key as a string (required) —
//                               or set GOOGLE_APPLICATION_CREDENTIALS to a key file path
//   CHROME_PUBLISH=true         also publish to the default channel (default: draft only)
// Flags:
//   --dry-run                   authenticate + locate the zip, but don't upload

const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const API = 'https://www.googleapis.com';

function fail(message) {
  console.error(`✖ chrome submit: ${message}`);
  // eslint-disable-next-line unicorn/no-process-exit -- this is a CLI step; exit code is its contract.
  process.exit(1);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const itemId = process.env['CHROME_EXTENSION_ID'];
  const keyJson = process.env['CHROME_SERVICE_ACCOUNT_KEY'];
  if (!itemId) fail('CHROME_EXTENSION_ID is not set.');

  // Locate the built zip (wxt zip → .output/<name>-<version>-chrome.zip).
  const zipName = readdirSync('.output').find((file) => file.endsWith('-chrome.zip'));
  if (!zipName) fail('no .output/*-chrome.zip found — run `pnpm zip` first.');
  const zipPath = `.output/${zipName}`;

  // Service-account auth: mint an access token for the chromewebstore scope. With a
  // key string we pass it inline; otherwise GoogleAuth reads GOOGLE_APPLICATION_CREDENTIALS.
  const auth = new GoogleAuth(
    keyJson ? { credentials: JSON.parse(keyJson), scopes: [SCOPE] } : { scopes: [SCOPE] },
  );
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  const token = accessToken.token;
  if (!token) fail('could not obtain an access token from the service account.');

  if (dryRun) {
    console.log(`✓ chrome submit (dry-run): authenticated; would upload ${zipPath} → ${itemId}.`);
    return;
  }

  const headers = { Authorization: `Bearer ${token}`, 'x-goog-api-version': '2' };

  // Upload the new package (updates the existing item; does not publish).
  const upload = await fetch(`${API}/upload/chromewebstore/v1.1/items/${itemId}`, {
    method: 'PUT',
    headers,
    body: readFileSync(zipPath),
  });
  const uploadResult = await upload.json();
  if (
    !upload.ok ||
    uploadResult.uploadState === 'FAILURE' ||
    uploadResult.uploadState === 'NOT_FOUND'
  ) {
    fail(`upload failed: ${JSON.stringify(uploadResult.itemError ?? uploadResult)}`);
  }
  console.log(
    `✓ chrome submit: uploaded ${zipPath} (uploadState=${String(uploadResult.uploadState)}).`,
  );

  if (process.env['CHROME_PUBLISH'] !== 'true') {
    console.log('  left as a draft — publish it in the Chrome Web Store dashboard.');
    return;
  }

  const publish = await fetch(`${API}/chromewebstore/v1.1/items/${itemId}/publish`, {
    method: 'POST',
    headers,
  });
  const publishResult = await publish.json();
  if (!publish.ok) fail(`publish failed: ${JSON.stringify(publishResult)}`);
  console.log(`✓ chrome submit: published (${JSON.stringify(publishResult.status)}).`);
}

await main();
