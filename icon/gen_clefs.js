const { execSync } = require('child_process');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Renders bass + alto (C) clef PNGs for all platforms, same GDI+/NotoMusic pipeline as
// gen_desktop_clef.js (treble). Outputs bass_clef.png / alto_clef.png to desktop/public,
// the Android drawable folder and the iOS Images.xcassets.
const fontFile = path.join(__dirname, 'NotoMusic-Regular.ttf');
const PAD = 8;
const clefs = [['bass_clef', 0x1D122], ['alto_clef', 0x1D121]];
const esc = p => p.replace(/\\/g, '\\\\');

(async () => {
  for (const [name, cp] of clefs) {
    const rawPng = path.join(__dirname, `${name}_raw_tmp.png`);
    const ps = `
Add-Type -AssemblyName System.Drawing
$pfc = New-Object System.Drawing.Text.PrivateFontCollection
$pfc.AddFontFile('${esc(fontFile)}')
$family = $pfc.Families[0]
$bmp = New-Object System.Drawing.Bitmap(800, 1600)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$clef = [char]::ConvertFromUtf32(${cp})
$font = New-Object System.Drawing.Font($family, 600, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
$fmt = [System.Drawing.StringFormat]::GenericTypographic
$g.DrawString($clef, $font, $brush, [float]10, [float]10, $fmt)
$g.Dispose()
$bmp.Save('${esc(rawPng)}')
`.trim();
    execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, { stdio: 'pipe' });

    const outFile = path.join(__dirname, '..', 'desktop', 'public', `${name}.png`);
    await sharp(rawPng)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
      .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toFile(outFile);
    fs.unlinkSync(rawPng);

    fs.copyFileSync(outFile, path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'drawable', `${name}.png`));
    // Images.xcassets (not Assets.xcassets) — see issue #33.
    const iosDir = path.join(__dirname, '..', 'ios', 'earring', 'Images.xcassets', `${name}.imageset`);
    fs.mkdirSync(iosDir, { recursive: true });
    fs.copyFileSync(outFile, path.join(iosDir, `${name}.png`));
    fs.writeFileSync(path.join(iosDir, 'Contents.json'), JSON.stringify({
      images: [
        { idiom: 'universal', filename: `${name}.png`, scale: '1x' },
        { idiom: 'universal', scale: '2x' },
        { idiom: 'universal', scale: '3x' },
      ],
      info: { version: 1, author: 'xcode' },
    }, null, 2));
    const m = await sharp(outFile).metadata();
    console.log(`${name}: ${m.width}x${m.height}`);
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
