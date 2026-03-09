/**
 * Web-specific platform override for CoreBridge.
 * Metro bundler resolves *.web.ts over *.ts on the web platform.
 */
export * from './EarRingCoreModule.web';
