const { execSync } = require('child_process');
const sharp = require('sharp');
const path = require('path');

// Render treble clef for Tauri desktop SVG.
// WebView2 font fallback for U+1D11E is unreliable; we render once here
// using Windows GDI+ (System.Drawing) which has full access to Segoe UI Symbol.
// sharp is then used only for trimming whitespace.

const rawPng  = path.join(__dirname, 'treble_raw_tmp.png');
const outFile = path.join(__dirname, '..', 'desktop', 'public', 'treble_clef.png');
const PAD = 8;

// Step 1: render via PowerShell GDI+
const ps = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(400, 900)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$clef = [char]::ConvertFromUtf32(0x1D11E)
$font = New-Object System.Drawing.Font('Segoe UI Symbol', 280, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
$g.DrawString($clef, $font, $brush, [float]0, [float]0)
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
    return sharp(outFile).metadata();
  })
  .then(m => console.log(`Generated ${outFile} (${m.width}x${m.height})`))
  .catch(e => console.error('ERROR:', e.message));
