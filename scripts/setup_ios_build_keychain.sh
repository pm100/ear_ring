#!/bin/sh
# One-time setup for headless (SSH) iOS code signing on the Mac.
#
# Problem: over SSH, codesign fails with errSecInternalComponent because the
# login keychain is locked per-session and there is no GUI SecurityAgent to
# unlock it. Storing the Mac login password on disk would be a bad idea.
#
# Solution (same pattern as CI): copy the signing identities into a dedicated
# "earring-build" keychain protected by its own random password stored in
# ~/.config/earring/build-keychain-pass (chmod 600). Build recipes unlock that
# keychain non-interactively and point codesign at it with --keychain.
#
# macOS will not allow private-key EXPORT without a GUI prompt, so the .p12
# export is a manual one-time step done in Keychain Access on the Mac:
#   1. Open Keychain Access (Spotlight: "Keychain Access")
#   2. "login" keychain -> Category "My Certificates"
#   3. Select "Apple Development: ..." (cmd-click any "Apple Distribution: ..."
#      entry too, if present)
#   4. File > Export Items... -> format .p12 -> save as earring-ids.p12 in your
#      home folder or Desktop -> set an export password (you'll re-enter it
#      once below, it is not stored)
#
# Then run this over SSH with a TTY:  ssh -t mac ./earring_keychain_setup.sh
# The .p12 is deleted after successful import.
# Re-run the whole procedure whenever the Apple certificate is renewed.
set -eu

P12=""
for cand in "${1:-}" "$HOME/earring-ids.p12" "$HOME/Desktop/earring-ids.p12"; do
  if [ -n "$cand" ] && [ -f "$cand" ]; then P12=$cand; break; fi
done
if [ -z "$P12" ]; then
  echo "No earring-ids.p12 found in \$HOME or \$HOME/Desktop."
  echo "Export it first in Keychain Access on the Mac (see comments in this script)."
  exit 1
fi
echo ">> Using exported identities: $P12"

mkdir -p ~/.config/earring
chmod 700 ~/.config/earring
PASSFILE=$HOME/.config/earring/build-keychain-pass
if [ ! -f "$PASSFILE" ]; then
  openssl rand -hex 24 > "$PASSFILE"
fi
chmod 600 "$PASSFILE"
PASS=$(cat "$PASSFILE")
KC=$HOME/Library/Keychains/earring-build.keychain-db

echo ">> Creating dedicated build keychain"
security delete-keychain "$KC" 2>/dev/null || true
security create-keychain -p "$PASS" "$KC"
security set-keychain-settings "$KC"
security unlock-keychain -p "$PASS" "$KC"

echo ">> Importing identities (enter the export password you chose in Keychain Access)"
security import "$P12" -k "$KC" -A -t cert -f pkcs12

echo ">> Authorizing command-line tools on the imported keys"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$PASS" "$KC" > /dev/null

rm -f "$P12"

echo ""
echo ">> Done. Identities now in the build keychain:"
security find-identity -v -p codesigning "$KC"
