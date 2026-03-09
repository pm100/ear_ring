/**
 * Platform-agnostic re-export of EarRingCoreModule.
 * On web, Metro bundler will resolve EarRingCoreModule.web.ts automatically.
 * On native, EarRingCoreModule.ts is used (wraps the Turbo Native Module).
 *
 * Import from this file everywhere in the app:
 *   import { staffPosition, generateSequence } from '../native/CoreBridge';
 */
export * from './EarRingCoreModule';
