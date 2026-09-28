#!/bin/sh

set -eu

# Xcode doesn't inherit the user's shell PATH, so add Rust/Cargo explicitly
export PATH="$HOME/.cargo/bin:$PATH"
REPO_ROOT="${PROJECT_DIR}/.."
GENERATED_DIR="${PROJECT_DIR}/build/generated/rust/${CONFIGURATION}${EFFECTIVE_PLATFORM_NAME}"

# Map one Xcode/Apple arch name to its Rust target triple for the current platform.
rust_target_for() {
  arch="$1"
  if [ "${PLATFORM_NAME}" = "iphonesimulator" ]; then
    case "${arch}" in
      x86_64) echo "x86_64-apple-ios" ;;
      *)      echo "aarch64-apple-ios-sim" ;;
    esac
  else
    echo "aarch64-apple-ios"
  fi
}

PROFILE_DIR="debug"
PROFILE_FLAG=""
if [ "${CONFIGURATION}" = "Release" ]; then
  PROFILE_DIR="release"
  PROFILE_FLAG="--release"
fi

mkdir -p "${GENERATED_DIR}"

# Build every architecture Xcode actually wants for this build and combine them
# into one universal static library. ARCHS can list more than one — e.g.
# Release's "arm64 x86_64" for iphonesimulator (ONLY_ACTIVE_ARCH=NO), vs.
# Debug's single active arch — so a single-arch guess here previously picked
# the wrong slice (x86_64) whenever ARCHS listed it alongside arm64, even
# though the actual link step only needed arm64. This built for every listed
# arch and lipo's them together instead, so whichever slice the linker wants
# is always present.
LIBS=""
for arch in ${ARCHS}; do
  target=$(rust_target_for "${arch}")
  cargo build \
    --manifest-path "${REPO_ROOT}/Cargo.toml" \
    --target "${target}" \
    ${PROFILE_FLAG} \
    -p ear_ring_core
  LIBS="${LIBS} ${REPO_ROOT}/target/${target}/${PROFILE_DIR}/libear_ring_core.a"
done

OUT="${GENERATED_DIR}/libear_ring_core.a"
set -- ${LIBS}
if [ "$#" -eq 1 ]; then
  cp "$1" "${OUT}"
else
  lipo -create ${LIBS} -output "${OUT}"
fi
