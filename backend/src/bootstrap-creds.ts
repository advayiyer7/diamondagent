// Bridges GCP service-account credentials from an env var to a file on disk.
//
// `@ai-sdk/google-vertex` / google-auth-library read GOOGLE_APPLICATION_CREDENTIALS
// as a *file path*. Locally that's your downloaded key. On hosts like Railway
// you can't mount a file, so set GOOGLE_APPLICATION_CREDENTIALS_JSON to the raw
// JSON of the key instead — this module writes it to a temp file and points
// GOOGLE_APPLICATION_CREDENTIALS at it.
//
// MUST be imported FIRST in index.ts, before any module that constructs a
// Vertex client (agent.ts / gemini.ts build theirs at import time).

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
if (json && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    // Validate it parses so we fail loudly rather than handing garbage to the
    // auth library.
    JSON.parse(json);
    const dest = join(tmpdir(), "gcp-service-account.json");
    writeFileSync(dest, json, { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = dest;
    console.log("[bootstrap] wrote GCP credentials from env to", dest);
  } catch (err) {
    console.error(
      "[bootstrap] GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON:",
      (err as Error).message,
    );
    process.exit(1);
  }
}
