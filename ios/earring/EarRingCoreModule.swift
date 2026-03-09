/**
 * EarRingCoreModule — Turbo Native Module (Swift)
 *
 * Setup instructions:
 * 1. Build the Rust library for iOS targets:
 *      cargo build --target aarch64-apple-ios --release -p ear_ring_core
 *      cargo build --target aarch64-apple-ios-sim --release -p ear_ring_core
 *      cargo build --target x86_64-apple-ios --release -p ear_ring_core
 *
 * 2. Create an XCFramework:
 *      xcodebuild -create-xcframework \
 *        -library target/aarch64-apple-ios/release/libear_ring_core.a \
 *        -headers rust/include/ \
 *        -library target/aarch64-apple-ios-sim/release/libear_ring_core.a \
 *        -headers rust/include/ \
 *        -output ios/EarRingCore.xcframework
 *
 * 3. Add EarRingCore.xcframework to the Xcode project (drag into Frameworks).
 *
 * 4. Add this file to the Xcode project and register the module in
 *    your AppDelegate:
 *      RCTBridge.moduleClasses.append(EarRingCoreModule.self)
 *
 * The C header (ear_ring_core.h) is generated from lib.rs — run:
 *   cbindgen --config cbindgen.toml --crate ear_ring_core --output rust/include/ear_ring_core.h
 */

import Foundation
import React

@objc(EarRingCore)
class EarRingCoreModule: NSObject, RCTBridgeModule {

  static func moduleName() -> String! { "EarRingCore" }
  static func requiresMainQueueSetup() -> Bool { false }

  /// Detect pitch in a PCM sample array.
  /// - Parameters:
  ///   - samples: Array of Float32 values in [-1.0, 1.0]
  ///   - sampleRate: Recording sample rate (e.g. 44100)
  /// - Returns: Detected frequency in Hz, or -1.0 if not detected
  @objc func detectPitch(_ samples: [NSNumber], sampleRate: Int) -> NSNumber {
    var floats = samples.map { $0.floatValue }
    var outHz: Float = 0
    let detected = ear_ring_detect_pitch(&floats, UInt32(floats.count), UInt32(sampleRate), &outHz)
    return detected == 1 ? NSNumber(value: outHz) : NSNumber(value: -1.0)
  }

  /// Convert frequency to nearest MIDI note and cents deviation.
  @objc func freqToNote(_ hz: Double, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    var outMidi: UInt8 = 0
    var outCents: Int32 = 0
    let ok = ear_ring_freq_to_note(Float(hz), &outMidi, &outCents)
    if ok == 1 {
      resolve(["midi": outMidi, "cents": outCents])
    } else {
      resolve(nil)
    }
  }

  /// Get staff position for a MIDI note (diatonic steps above C4).
  @objc func staffPosition(_ midi: Int) -> NSNumber {
    return NSNumber(value: ear_ring_staff_position(UInt8(midi)))
  }

  /// Generate a sequence of MIDI note numbers.
  @objc func generateSequence(_ rootMidi: Int, scaleId: Int, length: Int, seed: Double) -> [NSNumber] {
    var buf = [UInt8](repeating: 0, count: length)
    let count = ear_ring_generate_sequence(UInt8(rootMidi), UInt8(scaleId), UInt8(length), UInt64(seed), &buf)
    guard count >= 0 else { return [] }
    return buf.prefix(Int(count)).map { NSNumber(value: $0) }
  }
}
