#!/usr/bin/env node
/**
 * get_next_ios_build_number.js — best-effort guess at the next iOS CFBundleVersion.
 *
 * Queries the App Store Connect API for every build ever uploaded for this app
 * (regardless of TestFlight group/expiry) and returns the highest `version`
 * (CFBundleVersion) + 1. Uses only Node's built-in crypto/https — no npm
 * dependencies, since this runs on the Mac over SSH where an `npm install`
 * step is an extra failure point (see release_ios.js).
 *
 * This is a BEST-EFFORT guess, not authoritative: a build can be registered
 * with Apple (and so count toward the "already used" check) without ever
 * showing up cleanly here, e.g. an upload that errored out after registering
 * its version. release_ios.js uses this as a starting point and self-corrects
 * from Apple's own upload rejection if the guess turns out to be too low —
 * that rejection is the real source of truth, mirroring
 * get_next_version_code.js's relationship to release_android.js for Android.
 *
 * Run directly, diagnostics go to stderr and the resulting integer to
 * stdout, so callers can do: next=$(node get_next_ios_build_number.js)
 *
 * Required environment variables (same key already used by `just
 * ios-testflight`'s existing xcrun altool call — see justfile):
 *   APP_STORE_KEY_ID      Key ID for the .p8 API key (App Store Connect →
 *                         Users & Access → Integrations)
 *   APP_STORE_ISSUER_ID   Issuer ID shown on the same page
 * Optional:
 *   APP_STORE_APP_ID      Apple ID / adamId of the app (default: 6802447554,
 *                         "Ear Ring - Ear Trainer")
 *   APP_STORE_KEY_PATH    Path to the .p8 key (default:
 *                         ~/.private_keys/AuthKey_<APP_STORE_KEY_ID>.p8)
 */

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_APP_ID = '6802447554';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// App Store Connect API auth: a short-lived ES256 JWT signed with the .p8
// private key. `dsaEncoding: 'ieee-p1363'` makes Node emit the raw r||s
// signature JWS/ES256 requires, instead of the DER encoding crypto.sign()
// produces by default for EC keys — verified against a real API call before
// wiring this in (see AGENTS.md session notes if this ever needs re-deriving).
function makeToken(keyId, issuerId, privateKeyPem) {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = { iss: issuerId, exp: Math.floor(Date.now() / 1000) + 1200, aud: 'appstoreconnect-v1' };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), { key: privateKeyPem, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${base64url(signature)}`;
}

function requestJson(url, token) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Authorization: `Bearer ${token}` } }, res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`App Store Connect API ${res.statusCode}: ${body.slice(0, 500)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

async function getNextBuildNumber({ keyId, issuerId, keyPath, appId } = {}) {
  keyId = keyId || process.env.APP_STORE_KEY_ID;
  issuerId = issuerId || process.env.APP_STORE_ISSUER_ID;
  appId = appId || process.env.APP_STORE_APP_ID || DEFAULT_APP_ID;
  if (!keyId || !issuerId) {
    throw new Error('APP_STORE_KEY_ID and APP_STORE_ISSUER_ID must be set.');
  }
  keyPath = keyPath || process.env.APP_STORE_KEY_PATH || path.join(os.homedir(), '.private_keys', `AuthKey_${keyId}.p8`);
  const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
  const token = makeToken(keyId, issuerId, privateKeyPem);

  let highest = 0;
  let url = `https://api.appstoreconnect.apple.com/v1/builds?filter%5Bapp%5D=${appId}&sort=-uploadedDate&limit=200`;
  let pages = 0;
  while (url && pages < 5) {
    const json = await requestJson(url, token);
    for (const build of json.data || []) {
      const n = parseInt(build.attributes && build.attributes.version, 10);
      if (Number.isFinite(n) && n > highest) highest = n;
    }
    url = json.links && json.links.next;
    pages++;
  }
  console.error(`Highest build number found for app ${appId}: ${highest}`);
  return highest + 1;
}

module.exports = { getNextBuildNumber };

if (require.main === module) {
  (async () => {
    try {
      const next = await getNextBuildNumber();
      console.log(next);
    } catch (err) {
      console.error('');
      console.error('❌ Failed to determine next iOS build number:', err.message || err);
      process.exit(1);
    }
  })();
}
