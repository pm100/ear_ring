#!/usr/bin/env node
/**
 * release_android.js — build a signed release AAB, optionally upload it to
 * Play, and self-correct the versionCode if Play rejects it.
 *
 * versionCode selection:
 *   1. If VERSION_CODE is already set in the environment, use it as-is
 *      (no Play API call at all — useful for a deliberate override or a
 *      credential-free local build).
 *   2. Otherwise, ask Play Console for its best guess (highest versionCode
 *      across all tracks, +1) via get_next_version_code.js.
 *   3. That guess can be wrong — Play's versionCode uniqueness applies to
 *      every upload ever made to the package, including ones no read API
 *      can see (Internal App Sharing, an uncommitted edit, a release later
 *      dropped from a track). So on upload, if Play rejects with
 *      "Version code N has already been used", we treat N as ground
 *      truth, rebuild with N + 1, and retry — up to MAX_ATTEMPTS times.
 *
 * Usage:
 *   node release_android.js            build only (android-release)
 *   node release_android.js --upload   build + upload to Play (android-play)
 *
 * Required for --upload (and for step 2 above unless VERSION_CODE is set):
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON   path to service account key JSON file
 * Required for building (either mode):
 *   KEYSTORE_PASSWORD                  keystore password
 * Optional:
 *   KEY_PASSWORD, PLAY_PACKAGE_NAME, PLAY_TRACK, PLAY_RELEASE_STATUS,
 *   PLAY_RELEASE_NOTES, PLAY_LANGUAGE, PLAY_AAB_PATH
 */

const { google } = require('googleapis');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getNextVersionCode, PACKAGE_NAME } = require('./get_next_version_code');

const TRACK = process.env.PLAY_TRACK || 'internal';
const AAB_PATH = process.env.PLAY_AAB_PATH ||
  path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
const RELEASE_NOTES = process.env.PLAY_RELEASE_NOTES || 'Bug fixes and improvements.';
const LANGUAGE = process.env.PLAY_LANGUAGE || 'en-US';
const UPLOAD = process.argv.includes('--upload');
const MAX_ATTEMPTS = 5;

let publisherCache = null;
function getPublisher() {
  if (publisherCache) return publisherCache;
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
  publisherCache = google.androidpublisher({ version: 'v3', auth });
  return publisherCache;
}

function buildAab(versionCode) {
  console.log(`\nBuilding release AAB with versionCode ${versionCode}...`);
  const isWindows = process.platform === 'win32';
  const res = spawnSync(isWindows ? '.\\gradlew.bat' : './gradlew', ['bundleRelease'], {
    cwd: path.join(__dirname, '..', 'android'),
    env: { ...process.env, VERSION_CODE: String(versionCode) },
    stdio: 'inherit',
    shell: isWindows,
  });
  if (res.status !== 0) {
    console.error('Gradle build failed.');
    process.exit(res.status || 1);
  }
}

async function uploadAab(versionCode) {
  const publisher = getPublisher();
  console.log(`Creating Play Store edit...`);
  const editRes = await publisher.edits.insert({ packageName: PACKAGE_NAME });
  const editId = editRes.data.id;

  console.log(`Uploading AAB (versionCode ${versionCode})...`);
  await publisher.edits.bundles.upload({
    packageName: PACKAGE_NAME,
    editId,
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(AAB_PATH) },
  });

  console.log(`Assigning to ${TRACK} track...`);
  await publisher.edits.tracks.update({
    packageName: PACKAGE_NAME,
    editId,
    track: TRACK,
    requestBody: {
      track: TRACK,
      releases: [{
        versionCodes: [String(versionCode)],
        status: process.env.PLAY_RELEASE_STATUS || 'draft',
        releaseNotes: [{ language: LANGUAGE, text: RELEASE_NOTES }],
      }],
    },
  });

  console.log('Committing...');
  await publisher.edits.commit({ packageName: PACKAGE_NAME, editId });

  console.log('');
  console.log(`✅ Version ${versionCode} published to ${TRACK} testing track!`);
  console.log('   Testers will see the update in the Play Store within a few minutes.');
}

// Matches Play's own rejection text, e.g. "Version code 4 has already been used."
function parseConflictVersionCode(message) {
  const m = /version code (\d+) has already been used/i.exec(message || '');
  return m ? parseInt(m[1], 10) : null;
}

async function main() {
  let versionCode = process.env.VERSION_CODE
    ? parseInt(process.env.VERSION_CODE, 10)
    : await getNextVersionCode(getPublisher());

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    buildAab(versionCode);
    if (!UPLOAD) {
      console.log(`\nBuilt (not uploaded): android/app/build/outputs/bundle/release/app-release.aab`);
      return;
    }

    try {
      await uploadAab(versionCode);
      return;
    } catch (err) {
      const message = err.message || String(err);
      const conflict = parseConflictVersionCode(message);
      if (conflict && conflict >= versionCode && attempt < MAX_ATTEMPTS) {
        versionCode = conflict + 1;
        console.warn(`\n⚠️  Play rejected versionCode: "${message}"`);
        console.warn(`   Retrying with versionCode ${versionCode}...`);
        continue;
      }
      console.error('');
      console.error('❌ Publish failed:', message);
      if (err.errors) err.errors.forEach(e => console.error('  ', e.message));
      process.exit(1);
    }
  }
}

main();
