#!/usr/bin/env node
/**
 * tag_release.js — tag the released commit on GitHub, e.g. "build-ios-15" for a
 * test upload (TestFlight / Play closed testing) or "release-1.0" for production.
 *
 *   node tag_release.js <tagName> [message] [commit]   (commit defaults to HEAD)
 *
 * Also used by release_ios.js / release_android.js / publish_android.js, where a
 * failure only warns: the upload has already happened by then.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const REPO = path.join(__dirname, '..');

function git(...args) {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  return { ok: r.status === 0, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}

function tagRelease(tag, message, commit = 'HEAD') {
  if (git('rev-parse', '-q', '--verify', `refs/tags/${tag}`).ok) {
    console.log(`Tag ${tag} already exists; leaving it.`);
    return true;
  }
  const t = git('tag', '-a', tag, '-m', message || tag, commit);
  if (!t.ok) { console.warn(`⚠️  Could not create tag ${tag}: ${t.out}`); return false; }
  const p = git('push', 'origin', `refs/tags/${tag}`);
  if (!p.ok) { console.warn(`⚠️  Tag ${tag} created locally but not pushed: ${p.out}`); return false; }
  console.log(`Tagged ${tag} on GitHub.`);
  return true;
}

module.exports = { tagRelease };

if (require.main === module) {
  const [tag, message, commit] = process.argv.slice(2);
  if (!tag) { console.error('Usage: tag_release.js <tagName> [message] [commit]'); process.exit(1); }
  process.exit(tagRelease(tag, message, commit) ? 0 : 1);
}
