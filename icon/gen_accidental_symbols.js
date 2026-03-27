/**
 * gen_accidental_symbols.js
 *
 * Generates sharp.png and flat.png (plus _correct / _wrong / _active colour
 * variants) for use across Android, iOS, and Tauri.
 *
 * Each PNG has its visual anchor (belly for ♭, bar-centre for ♯) at EXACTLY
 * 50% of the image height.  All platforms position with:
 *
 *   y = targetStaffLineY - displayHeight / 2
 *
 * Display height multipliers (same on every platform):
 *   ♭  →  lineSpacing * 3.0
 *   ♯  →  lineSpacing * 2.0
 *
 * Colour variants (suffix → note state):
 *   (none)    → EXPECTED / key-signature  (#333333)
 *   _correct  → CORRECT                  (#4CAF50)
 *   _wrong    → INCORRECT                (#F44336)
 *   _active   → ACTIVE                   (#3F51B5)
 *
 * Outputs (16 files total, 8 per symbol):
 *   desktop/public/{flat,sharp}{,_correct,_wrong,_active}.png
 *   android/.../res/drawable/{flat,sharp}{,_correct,_wrong,_active}.png
 *   ios/.../Assets.xcassets/{flat,sharp}{,_correct,_wrong,_active}.imageset/
 */

const { execSync } = require('child_process');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

const FONT_SIZE = 400;

// Fraction of the trimmed glyph where the visual anchor sits.
const FLAT_ANCHOR_FRAC  = 0.731;  // belly ~73% from top of trimmed ♭ (Segoe UI Symbol)
const SHARP_ANCHOR_FRAC = 0.50;   // bars centred in ♯

const MARGIN = 12;

// Colour variants: suffix → { r, g, b }
const COLORS = [
  { suffix: '',         r: 0x33, g: 0x33, b: 0x33 },  // #333333 expected / key-sig
  { suffix: '_correct', r: 0x4C, g: 0xAF, b: 0x50 },  // #4CAF50 correct
  { suffix: '_wrong',   r: 0xF4, g: 0x43, b: 0x36 },  // #F44336 incorrect
  { suffix: '_active',  r: 0x3F, g: 0x51, b: 0xB5 },  // #3F51B5 active
];

// ─── helpers ────────────────────────────────────────────────────────────────

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyTo(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function writeIosImageset(src, name) {
  const dir = path.join(ROOT, `ios/earring/Assets.xcassets/${name}.imageset`);
  ensureDir(dir);
  fs.copyFileSync(src, path.join(dir, `${name}.png`));
  const contents = {
    images: [
      { idiom: 'universal', filename: `${name}.png`, scale: '1x' },
      { idiom: 'universal', scale: '2x' },
      { idiom: 'universal', scale: '3x' },
    ],
    info: { version: 1, author: 'xcode' },
  };
  fs.writeFileSync(path.join(dir, 'Contents.json'), JSON.stringify(contents, null, 2));
}

/**
 * Recolour a raw RGBA buffer: replace every pixel's RGB with (r,g,b),
 * preserving the alpha channel unchanged.
 */
function recolour(rawBuf, r, g, b) {
  const out = Buffer.from(rawBuf);
  for (let i = 0; i < out.length; i += 4) {
    out[i]     = r;
    out[i + 1] = g;
    out[i + 2] = b;
    // out[i + 3] = alpha — unchanged
  }
  return out;
}

// ─── core renderer ──────────────────────────────────────────────────────────

/**
 * Renders a glyph via GDI+, trims whitespace, pads so the anchor is at
 * exactly 50% height, then emits one PNG per colour variant.
 * Returns the public/ paths of the generated files.
 */
async function generateSymbol({ codepoint, name, anchorFrac }) {
  const tmpRaw = path.join(__dirname, `${name}_raw_tmp.png`);

  // Step 1: render via PowerShell GDI+
  const ps = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(${FONT_SIZE * 3}, ${FONT_SIZE * 3})
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$font = New-Object System.Drawing.Font('Segoe UI Symbol', ${FONT_SIZE}, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
$g.DrawString([char]0x${codepoint}, $font, $brush, [float]0, [float]0)
$g.Dispose()
$bmp.Save('${tmpRaw.replace(/\\/g, '\\\\')}')
`.trim();

  execSync(
    `powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`,
    { stdio: 'pipe' }
  );

  // Step 2: tight-trim
  const trimBuf = await sharp(tmpRaw)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  fs.unlinkSync(tmpRaw);

  const { width: trimW, height: trimH } = trimBuf.info;

  // Step 3: compute padding so anchor is at 50%.
  const anchorPx = anchorFrac * trimH;
  let paddingTop    = 0;
  let paddingBottom = 0;
  if (anchorPx < trimH / 2) {
    paddingTop    = Math.round(trimH - 2 * anchorPx);  // anchor in top half → pad top
  } else {
    paddingBottom = Math.round(2 * anchorPx - trimH);  // anchor in bottom half → pad bottom
  }

  // Step 4: extend (adds anchor-centering pad + breathing margin) → base PNG
  const basePng = await sharp(trimBuf.data, { raw: { width: trimW, height: trimH, channels: 4 } })
    .extend({
      top:    paddingTop    + MARGIN,
      bottom: paddingBottom + MARGIN,
      left:   MARGIN,
      right:  MARGIN,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: finalW, height: finalH } = basePng.info;

  // Step 5: emit one PNG per colour variant
  const outPaths = [];
  for (const { suffix, r, g, b } of COLORS) {
    const coloured = recolour(basePng.data, r, g, b);
    const outFile = path.join(ROOT, 'desktop', 'public', `${name}${suffix}.png`);
    await sharp(coloured, { raw: { width: finalW, height: finalH, channels: 4 } })
      .png()
      .toFile(outFile);
    outPaths.push({ suffix, outFile });
  }

  console.log(`Generated ${name} variants (${finalW}×${finalH}, anchor@50%)`);
  return outPaths;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Generating accidental symbol PNGs ===\n');

  const flatVariants  = await generateSymbol({ codepoint: '266D', name: 'flat',  anchorFrac: FLAT_ANCHOR_FRAC  });
  const sharpVariants = await generateSymbol({ codepoint: '266F', name: 'sharp', anchorFrac: SHARP_ANCHOR_FRAC });

  console.log('\n=== Distributing to platforms ===\n');

  const androidDrawable = path.join(ROOT, 'android/app/src/main/res/drawable');

  for (const { suffix, outFile } of [...flatVariants, ...sharpVariants]) {
    const baseName = path.basename(outFile, '.png');
    const pngName  = `${baseName}.png`;

    // Android
    copyTo(outFile, path.join(androidDrawable, pngName));

    // iOS
    writeIosImageset(outFile, baseName);
  }

  console.log('  → Android drawable/ + iOS imagesets: done');
  console.log('  → Tauri desktop/public/: already generated');
  console.log('\n✅ Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
