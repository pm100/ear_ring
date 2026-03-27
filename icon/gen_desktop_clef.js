const { execSync } = require('child_process');
const sharp = require('sharp');
const path = require('path');

// Render treble clef for Tauri desktop SVG.
// WebView2 font fallback for U+1D11E is unreliable; we render once here
// using Windows GDI+ (System.Drawing) which has full access to Segoe UI Symbol.
// Uses StringFormat.GenericTypographic + TextRenderingHint.AntiAlias to get
// tight, proportional bounds matching Android's Skia text rendering.

const rawPng  = path.join(__dirname, 'treble_raw_tmp.png');
const outFile = path.join(__dirname, '..', 'desktop', 'public', 'treble_clef.png');
const PAD = 8;

// Step 1: render via PowerShell GDI+ with GenericTypographic for tight bounds
const ps = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(800, 1600)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$clef = [char]::ConvertFromUtf32(0x1D11E)
$font = New-Object System.Drawing.Font('Segoe UI Symbol', 600, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
$fmt = [System.Drawing.StringFormat]::GenericTypographic
$g.DrawString($clef, $font, $brush, [float]10, [float]10, $fmt)
$g.Dispose()
$bmp.Save('${rawPng.replace(/\\/g, '\\\\')}')
`.trim();

execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, { stdio: 'pipe' });

// Step 2: trim whitespace + pad with sharp
sharp(rawPng)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
  .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(outFile)
  .then(() => {
    require('fs').unlinkSync(rawPng);

    // Distribute to Android and iOS
    const fs = require('fs');
    const androidDest = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'drawable', 'treble_clef.png');
    fs.copyFileSync(outFile, androidDest);

    const iosDir = path.join(__dirname, '..', 'ios', 'earring', 'Assets.xcassets', 'treble_clef.imageset');
    if (!fs.existsSync(iosDir)) fs.mkdirSync(iosDir, { recursive: true });
    fs.copyFileSync(outFile, path.join(iosDir, 'treble_clef.png'));
    const contents = JSON.stringify({
      images: [
        { idiom: 'universal', filename: 'treble_clef.png', scale: '1x' },
        { idiom: 'universal', scale: '2x' },
        { idiom: 'universal', scale: '3x' },
      ],
      info: { version: 1, author: 'xcode' },
    }, null, 2);
    fs.writeFileSync(path.join(iosDir, 'Contents.json'), contents);

    return sharp(outFile).metadata();
  })
  .then(m => console.log(`Generated ${outFile} (${m.width}x${m.height})`))
  .catch(e => console.error('ERROR:', e.message));
