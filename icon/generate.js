const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SVG = fs.readFileSync(path.join(__dirname, 'icon.svg'));

async function png(size, dest) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await sharp(SVG).resize(size, size).png().toFile(dest);
  console.log(`  ${size}x${size} → ${path.relative(ROOT, dest)}`);
}

async function main() {
  console.log('\n=== Android launcher icons ===');
  const androidDensities = [
    { size: 48,  dir: 'mipmap-mdpi' },
    { size: 72,  dir: 'mipmap-hdpi' },
    { size: 96,  dir: 'mipmap-xhdpi' },
    { size: 144, dir: 'mipmap-xxhdpi' },
    { size: 192, dir: 'mipmap-xxxhdpi' },
  ];
  const androidRes = path.join(ROOT, 'android/app/src/main/res');
  for (const { size, dir } of androidDensities) {
    const base = path.join(androidRes, dir);
    // Remove old webp launcher icons
    for (const f of ['ic_launcher.webp', 'ic_launcher_round.webp']) {
      const p = path.join(base, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    await png(size, path.join(base, 'ic_launcher.png'));
    await png(size, path.join(base, 'ic_launcher_round.png'));
  }

  console.log('\n=== iOS AppIcon ===');
  const iosAssets = path.join(ROOT, 'ios/earring/Images.xcassets/AppIcon.appiconset');
  await png(1024, path.join(iosAssets, 'AppIcon-1024.png'));
  // Update Contents.json to reference the PNG
  const contentsJson = {
    images: [{ idiom: 'universal', platform: 'ios', size: '1024x1024', filename: 'AppIcon-1024.png' }],
    info: { version: 1, author: 'xcode' }
  };
  fs.writeFileSync(path.join(iosAssets, 'Contents.json'), JSON.stringify(contentsJson, null, 2));
  console.log('  Updated Contents.json');

  console.log('\n=== Desktop / Tauri icons ===');
  const tauriIcons = path.join(ROOT, 'desktop/src-tauri/icons');
  await png(32,  path.join(tauriIcons, '32x32.png'));
  await png(128, path.join(tauriIcons, '128x128.png'));
  await png(256, path.join(tauriIcons, '128x128@2x.png'));
  await png(256, path.join(tauriIcons, '256x256.png'));
  await png(512, path.join(tauriIcons, '512x512.png'));
  await png(1024, path.join(tauriIcons, 'icon.png'));

  // Generate icon.ico using dynamic import (ESM package)
  console.log('\n=== Generating icon.ico ===');
  const { default: pngToIco } = await import('png-to-ico');
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(
    icoSizes.map(s => sharp(SVG).resize(s, s).png().toBuffer())
  );
  const icoBuffer = await pngToIco(icoBuffers);
  fs.writeFileSync(path.join(tauriIcons, 'icon.ico'), icoBuffer);
  console.log('  icon.ico (16/32/48/64/128/256px)');

  // Also save a master 1024px PNG in the icon/ folder for reference
  await png(1024, path.join(__dirname, 'icon-1024.png'));

  console.log('\n✅ All icons generated!');
}

main().catch(err => { console.error(err); process.exit(1); });
