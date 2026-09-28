#!/usr/bin/env node
/**
 * release_ios.js — archive, export, and (optionally) upload the iOS app to
 * TestFlight, self-correcting CFBundleVersion if Apple rejects it as
 * already-used. Mirrors release_android.js's versionCode self-correct
 * pattern for Android.
 *
 * Build number selection:
 *   1. IOS_BUILD_NUMBER env var, if set, is used as-is (no API call at all).
 *   2. Otherwise, ask App Store Connect for its best guess (highest build
 *      number ever uploaded for this app, +1) via get_next_ios_build_number.js.
 *   3. That guess can be wrong. If `xcrun altool --upload-app` rejects the
 *      upload with wording that looks like a build-number conflict, bump the
 *      number by 1 and retry — up to MAX_ATTEMPTS. Unlike Android's Play
 *      error text (a stable, documented format), Apple's exact wording for
 *      this isn't reliably documented, so the check here is a broad
 *      keyword match rather than parsing out an exact conflicting number.
 *
 * Usage (run on macOS, via `just ios-archive` / `just ios-testflight`):
 *   node release_ios.js            archive + export only
 *   node release_ios.js --upload   archive + export + upload to TestFlight
 *
 * Required:
 *   APP_STORE_KEY_ID, APP_STORE_ISSUER_ID   same App Store Connect API key
 *   already used by the old direct xcrun altool call (see justfile).
 * Optional:
 *   APP_STORE_APP_ID     defaults to 6802447554 ("Ear Ring - Ear Trainer")
 *   IOS_BUILD_NUMBER     manual override, skips the App Store Connect guess
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getNextBuildNumber } = require('./get_next_ios_build_number');

const UPLOAD = process.argv.includes('--upload');
const MAX_ATTEMPTS = 5;
const IOS_DIR = path.join(__dirname, '..', 'ios');
const INFO_PLIST = path.join(IOS_DIR, 'earring', 'Info.plist');
const KEY_ID = process.env.APP_STORE_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_ISSUER_ID;
const KEY_PATH = process.env.APP_STORE_KEY_PATH || path.join(os.homedir(), '.private_keys', `AuthKey_${KEY_ID}.p8`);

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: IOS_DIR, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  return { status: res.status, output: (res.stdout || '') + (res.stderr || '') };
}

/** Rewrites CFBundleVersion in Info.plist in place. Refuses to write blind
 *  if the key isn't found in the shape we expect (see AGENTS.md: this field
 *  is a hand-maintained literal, not wired to project.pbxproj). */
function writeBuildNumber(n) {
  const plist = fs.readFileSync(INFO_PLIST, 'utf8');
  const updated = plist.replace(/(<key>CFBundleVersion<\/key>\s*\n\s*<string>)[^<]*(<\/string>)/, `$1${n}$2`);
  if (updated === plist) {
    throw new Error(`CFBundleVersion key not found in the expected shape in ${INFO_PLIST} — refusing to write blind.`);
  }
  fs.writeFileSync(INFO_PLIST, updated);
  console.log(`Set CFBundleVersion to ${n} in ios/earring/Info.plist`);
}

function archiveAndExport() {
  console.log('\nArchiving...');
  let { status, output } = run('xcodebuild', [
    'archive', '-project', 'earring.xcodeproj', '-scheme', 'earring',
    '-configuration', 'Release', '-archivePath', '/tmp/earring.xcarchive',
    '-allowProvisioningUpdates',
  ]);
  if (status !== 0) {
    console.error(output);
    throw new Error('xcodebuild archive failed.');
  }

  console.log('Exporting IPA...');
  ({ status, output } = run('xcodebuild', [
    '-exportArchive', '-archivePath', '/tmp/earring.xcarchive',
    '-exportOptionsPlist', 'ExportOptions.plist', '-exportPath', '/tmp/earring_export',
    '-allowProvisioningUpdates',
    '-authenticationKeyPath', KEY_PATH,
    '-authenticationKeyID', KEY_ID,
    '-authenticationKeyIssuerID', ISSUER_ID,
  ]));
  if (status !== 0) {
    console.error(output);
    throw new Error('xcodebuild -exportArchive failed.');
  }
}

function uploadToTestFlight() {
  console.log('Uploading to TestFlight...');
  return run('xcrun', [
    'altool', '--upload-app', '-f', '/tmp/earring_export/earring.ipa', '-t', 'ios',
    '--apiKey', KEY_ID, '--apiIssuer', ISSUER_ID, '--output-format', 'xml',
  ]);
}

function looksLikeBuildNumberConflict(output) {
  const lower = output.toLowerCase();
  return (
    lower.includes('cfbundleversion') ||
    lower.includes('redundant binary upload') ||
    (lower.includes('bundle version') && /already|higher|used|newer/.test(lower))
  );
}

async function main() {
  if (!KEY_ID || !ISSUER_ID) {
    console.error('APP_STORE_KEY_ID and APP_STORE_ISSUER_ID must be set.');
    process.exit(1);
  }

  let buildNumber = process.env.IOS_BUILD_NUMBER
    ? parseInt(process.env.IOS_BUILD_NUMBER, 10)
    : await getNextBuildNumber({ keyId: KEY_ID, issuerId: ISSUER_ID, keyPath: KEY_PATH });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    writeBuildNumber(buildNumber);
    archiveAndExport();

    if (!UPLOAD) {
      console.log(`\nExported (not uploaded): /tmp/earring_export/earring.ipa (build ${buildNumber})`);
      return;
    }

    const { status, output } = uploadToTestFlight();
    if (status === 0) {
      console.log('');
      console.log(`✅ Build ${buildNumber} uploaded to TestFlight!`);
      return;
    }

    if (looksLikeBuildNumberConflict(output) && attempt < MAX_ATTEMPTS) {
      buildNumber += 1;
      console.warn(`\n⚠️  Upload rejected — looks like a build-number conflict. Retrying with ${buildNumber}...`);
      console.warn(output);
      continue;
    }

    console.error('');
    console.error('❌ Upload failed:');
    console.error(output);
    process.exit(1);
  }
}

main();
