#!/usr/bin/env node
/**
 * publish_android.js — upload a signed release AAB to Play Store internal testing.
 *
 * Required environment variables:
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  path to your service account key JSON file
 *                                     (download from Google Play Console →
 *                                      Setup → API access → Service accounts)
 *
 * Optional:
 *   PLAY_PACKAGE_NAME   defaults to "com.earring"
 *   PLAY_AAB_PATH       defaults to android/app/build/outputs/bundle/release/app-release.aab
 *   PLAY_TRACK          defaults to "internal" (other options: alpha, beta, production)
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = process.env.PLAY_PACKAGE_NAME || 'com.earring';
const TRACK = process.env.PLAY_TRACK || 'internal';
const AAB_PATH = process.env.PLAY_AAB_PATH ||
  path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');

async function main() {
  const keyFile = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!keyFile) {
    console.error('Error: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set.');
    console.error('Point it at your service account JSON key file:');
    console.error('  $env:GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = "C:\\path\\to\\key.json"');
    console.error('');
    console.error('To create a service account:');
    console.error('  1. Play Console → Setup → API access → Link Google Cloud project');
    console.error('  2. Create service account with "Release manager" role');
    console.error('  3. Download JSON key');
    process.exit(1);
  }

  if (!fs.existsSync(AAB_PATH)) {
    console.error(`Error: AAB not found at ${AAB_PATH}`);
    console.error('Run "just android-release" first to build the signed AAB.');
    process.exit(1);
  }

  console.log(`Package : ${PACKAGE_NAME}`);
  console.log(`Track   : ${TRACK}`);
  console.log(`AAB     : ${AAB_PATH}`);
  console.log('');

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  const publisher = google.androidpublisher({ version: 'v3', auth });

  // 1. Create an edit session
  console.log('Creating Play Store edit...');
  const editRes = await publisher.edits.insert({ packageName: PACKAGE_NAME });
  const editId = editRes.data.id;
  console.log(`Edit ID: ${editId}`);

  // 2. Upload the AAB
  console.log('Uploading AAB (this may take a minute)...');
  const aabSize = fs.statSync(AAB_PATH).size;
  console.log(`  File size: ${(aabSize / 1024 / 1024).toFixed(1)} MB`);
  const bundleRes = await publisher.edits.bundles.upload({
    packageName: PACKAGE_NAME,
    editId,
    media: {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(AAB_PATH),
    },
  });
  const versionCode = bundleRes.data.versionCode;
  console.log(`Uploaded version code: ${versionCode}`);

  // 3. Assign to the target track
  console.log(`Assigning to ${TRACK} track...`);
  await publisher.edits.tracks.update({
    packageName: PACKAGE_NAME,
    editId,
    track: TRACK,
    requestBody: {
      track: TRACK,
      releases: [{
        versionCodes: [String(versionCode)],
        status: 'completed',
      }],
    },
  });

  // 4. Commit
  console.log('Committing...');
  await publisher.edits.commit({ packageName: PACKAGE_NAME, editId });

  console.log('');
  console.log(`✅ Version ${versionCode} published to ${TRACK} testing track!`);
  console.log('   Testers will see the update in the Play Store within a few minutes.');
}

main().catch(err => {
  console.error('');
  console.error('❌ Publish failed:', err.message || err);
  if (err.errors) {
    err.errors.forEach(e => console.error('  ', e.message));
  }
  process.exit(1);
});
