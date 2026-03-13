#!/bin/sh

set -eu

REPO_ROOT="${PROJECT_DIR}/.."
GENERATED_DIR="${PROJECT_DIR}/build/generated/rust/${CONFIGURATION}${EFFECTIVE_PLATFORM_NAME}"

if [ "${PLATFORM_NAME}" = "iphonesimulator" ]; then
  SIM_ARCHS="${NATIVE_ARCH_ACTUAL:-${CURRENT_ARCH:-${ARCHS:-}}} ${ARCHS:-}"
  case " ${SIM_ARCHS} " in
    *" x86_64 "*)
      RUST_TARGET="x86_64-apple-ios"
      ;;
    *)
      RUST_TARGET="aarch64-apple-ios-sim"
      ;;
  esac
else
  RUST_TARGET="aarch64-apple-ios"
fi

PROFILE_DIR="debug"
PROFILE_FLAG=""
if [ "${CONFIGURATION}" = "Release" ]; then
  PROFILE_DIR="release"
  PROFILE_FLAG="--release"
fi

mkdir -p "${GENERATED_DIR}"

cargo build \
  --manifest-path "${REPO_ROOT}/Cargo.toml" \
  --target "${RUST_TARGET}" \
  ${PROFILE_FLAG} \
  -p ear_ring_core

cp "${REPO_ROOT}/target/${RUST_TARGET}/${PROFILE_DIR}/libear_ring_core.a" "${GENERATED_DIR}/libear_ring_core.a"
