#!/usr/bin/env node
/**
 * get_next_version_code.js — best-effort guess at the next Android versionCode.
 *
 * Queries the Play Developer API for every track (internal, alpha/closed
 * testing, beta/open testing, production, and any custom tracks) and finds
 * the highest versionCode currently assigned to a release on any of them,
 * then returns max + 1.
 *
 * This is a BEST-EFFORT guess, not authoritative: Play enforces a strictly
 * increasing versionCode across every upload ever made to the package,
 * including ones that never landed on a track (e.g. Internal App Sharing,
 * or an edit that was uploaded but never committed) or that have since been
 * superseded and dropped out of a track's current release. Those aren't
 * visible through this API. release_android.js uses this as a starting
 * point and self-corrects from Play's own rejection error if the guess
 * turns out to be too low — that error is the real source of truth.
 *
 * Run directly, diagnostics go to stderr and the resulting integer to
 * stdout, so callers can do: $nextCode = node get_next_version_code.js
 *
 * Required environment variables:
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  path to your service account key JSON file
 *                                     (download from Google Play Console →
 *                                      Setup → API access → Service accounts)
 *
 * Optional:
 *   PLAY_PACKAGE_NAME   defaults to "com.jollygoodsw.earring"
 */

const { google } = require('googleapis');

const PACKAGE_NAME = process.env.PLAY_PACKAGE_NAME || 'com.jollygoodsw.earring';

// A read-only edit session is required to list tracks. We never commit it.
async function getNextVersionCode(publisher, packageName = PACKAGE_NAME) {
  const editRes = await publisher.edits.insert({ packageName });
  const editId = editRes.data.id;

  let highest = 0;
  try {
    const tracksRes = await publisher.edits.tracks.list({ packageName, editId });
    const tracks = tracksRes.data.tracks || [];
    for (const track of tracks) {
      for (const release of track.releases || []) {
        for (const code of release.versionCodes || []) {
          const n = parseInt(code, 10);
          if (Number.isFinite(n) && n > highest) highest = n;
        }
      }
    }
    console.error(`Highest versionCode found across ${tracks.length} track(s): ${highest}`);
  } finally {
    // Discard the edit — we made no changes and don't want a dangling draft.
    await publisher.edits.delete({ packageName, editId }).catch(() => {});
  }

  return highest + 1;
}

module.exports = { getNextVersionCode, PACKAGE_NAME };

if (require.main === module) {
  (async () => {
    const keyFile = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    if (!keyFile) {
      console.error('Error: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set.');
      console.error('Point it at your service account JSON key file:');
      console.error('  $env:GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = "C:\\path\\to\\key.json"');
      process.exit(1);
    }

    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const publisher = google.androidpublisher({ version: 'v3', auth });

    try {
      const next = await getNextVersionCode(publisher);
      console.log(next);
    } catch (err) {
      console.error('');
      console.error('❌ Failed to determine next version code:', err.message || err);
      if (err.errors) err.errors.forEach(e => console.error('  ', e.message));
      process.exit(1);
    }
  })();
}
