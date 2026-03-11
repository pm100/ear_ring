const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Generate treble clef PNG for Android.
// Uses Windows system font (Segoe UI Symbol) via SVG — the Musical Symbols
// Unicode block (U+1D11E) is stripped from Android's subsetted Noto fonts.
// We render once on the dev machine and bundle the result as a drawable.
//
// Output: drawable-nodpi/ic_treble_clef.png (200×500)
// MusicStaff.kt scales it dynamically to match the actual staff lineSpacing.

const W = 200, H = 500;
// font-size and y-offset tuned so the clef fills the image with minimal padding
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <text x="10" y="430" font-size="400"
        font-family="Segoe UI Symbol, Arial Unicode MS, serif"
        fill="#333333">&#x1D11E;</text>
</svg>`;

const nodpiDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'drawable-nodpi');
fs.mkdirSync(nodpiDir, { recursive: true });

const outFile = path.join(nodpiDir, 'ic_treble_clef.png');

sharp(Buffer.from(svg))
  .png()
  .toFile(outFile)
  .then(() => {
    const stats = fs.statSync(outFile);
    console.log(`Generated ${outFile} (${stats.size} bytes)`);
  })
  .catch(e => console.error('ERROR:', e.message));
