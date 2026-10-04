/** Regenerate committed brand images: node scripts/generate-brand-assets.mjs. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";
import { chromium } from "@playwright/test";

const root = process.cwd();
const tokens = await readFile(resolve(root, "app/tokens.css"), "utf8");
function color(name) {
  const value = tokens.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`Missing design token: ${name}`);
  return value;
}
const ink = color("content-primary");
const paper = color("surface-page");
const tomato = color("action-primary");
const lime = color("accent-fresh");
const white = color("surface-raised");
const muted = color("content-secondary");
const out = resolve(root, "public/assets/brand");
await mkdir(out, { recursive: true });
const svg = (width, height, body) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );
// A single bold gift silhouette remains recognizable at browser-tab sizes.
const icon = svg(
  512,
  512,
  `
  <rect x="16" y="16" width="480" height="480" rx="116" fill="${tomato}" stroke="${ink}" stroke-width="24"/>
  <g fill="none" stroke="${ink}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
    <path d="M256 208C170 214 133 165 163 138C195 110 240 152 256 208Z"/>
    <path d="M256 208C342 214 379 165 349 138C317 110 272 152 256 208Z"/>
    <rect x="127" y="211" width="258" height="66" rx="12" fill="${paper}"/>
    <path d="M145 277V377Q145 392 161 392H351Q367 392 367 377V277" fill="${paper}"/>
    <path d="M256 213V392"/>
  </g>`,
);
await writeFile(join(out, "gift-mark.svg"), icon);
await sharp(icon).png().toFile(resolve(root, "app/icon.png"));
await sharp(icon)
  .resize(180, 180)
  .flatten({ background: paper })
  .png()
  .toFile(resolve(root, "app/apple-icon.png"));
const sizes = [16, 32, 48];
const iconBuffers = await Promise.all(
  sizes.map((size) => sharp(icon).resize(size, size).png().toBuffer()),
);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
iconBuffers.forEach((buffer, index) => {
  const start = 6 + index * 16;
  header[start] = sizes[index];
  header[start + 1] = sizes[index];
  header.writeUInt16LE(1, start + 4);
  header.writeUInt16LE(32, start + 6);
  header.writeUInt32LE(buffer.length, start + 8);
  header.writeUInt32LE(offset, start + 12);
  offset += buffer.length;
});
await writeFile(
  resolve(root, "app/favicon.ico"),
  Buffer.concat([header, ...iconBuffers]),
);

const composition = svg(
  1200,
  630,
  `
  <rect width="1200" height="630" fill="${paper}"/>
  <rect x="0" y="604" width="1200" height="26" fill="${tomato}"/>
  <rect x="749" y="153" width="375" height="355" rx="36" fill="${ink}" transform="rotate(5 940 330)"/>
  <rect x="739" y="142" width="375" height="355" rx="36" fill="${lime}" stroke="${ink}" stroke-width="4" transform="rotate(5 930 320)"/>
  <rect x="742" y="168" width="357" height="334" rx="32" fill="${ink}"/>
  <rect x="732" y="158" width="357" height="334" rx="32" fill="${white}" stroke="${ink}" stroke-width="4"/>
  <path d="M757 255H1064" stroke="${ink}" stroke-width="3"/>
  <rect x="762" y="285" width="56" height="56" rx="14" fill="${tomato}" stroke="${ink}" stroke-width="3"/>
  <path d="M778 313L789 324L804 302" stroke="${ink}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="762" y="361" width="56" height="56" rx="14" fill="${lime}" stroke="${ink}" stroke-width="3"/>
  <path d="M778 389L789 400L804 378" stroke="${ink}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="868" y="453" width="269" height="76" rx="38" fill="${ink}"/>
  <rect x="860" y="445" width="269" height="76" rx="38" fill="${tomato}" stroke="${ink}" stroke-width="4"/>
  <path d="M1084 482H1111M1100 471L1111 482L1100 493" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M1107 91V127M1089 109H1125" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
`,
);
// Chromium loads the exact variable WOFF2 files used by next/font in the app.
// Rasterizers that do not support WOFF2 can silently substitute system fonts.
const displayFont = (
  await readFile(
    resolve(root, "app/fonts/bricolage-grotesque-latin-variable.woff2"),
  )
).toString("base64");
const bodyFont = (
  await readFile(resolve(root, "app/fonts/dm-sans-latin-variable.woff2"))
).toString("base64");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html><html><head><style>
    @font-face{font-family:BrandDisplay;src:url(data:font/woff2;base64,${displayFont}) format('woff2');font-weight:200 800;font-style:normal;font-display:block}
    @font-face{font-family:BrandBody;src:url(data:font/woff2;base64,${bodyFont}) format('woff2');font-weight:100 1000;font-style:normal;font-display:block}
    *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;overflow:hidden;background:${paper};color:${ink};font-family:BrandBody;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
    .art{position:absolute;inset:0}.text{position:absolute;margin:0;line-height:1}
    .wordmark{left:62px;top:47px;font-family:BrandDisplay;font-weight:800;font-size:48px;letter-spacing:-.025em;display:flex;align-items:baseline}
    .wordmark span{margin-left:.22em;position:relative}.wordmark svg{position:absolute;bottom:-.22em;left:0;width:100%;height:.28em}
    .eyebrow{left:64px;top:163px;font-size:21px;font-weight:700;letter-spacing:.025em}
    h1{left:60px;top:213px;font-family:BrandDisplay;font-weight:800;font-size:72px;letter-spacing:-.025em;line-height:1!important}
    .subline{left:64px;top:515px;font-size:27px;color:${muted}}
    .card-title{left:762px;top:192px;font-family:BrandDisplay;font-size:35px;font-weight:800}
    .item{left:838px;font-size:23px;font-weight:700}.one{top:302px}.two{top:378px}
    .share{left:885px;top:469px;font-size:23px;font-weight:700}
  </style></head><body>
    <div class="art">${composition.toString()}</div>
    <div class="text wordmark">Get Me<span>This<svg viewBox="0 0 100 12" preserveAspectRatio="none"><path d="M2 8 C 18 2, 30 12, 48 6 S 80 2, 98 7" fill="none" stroke="${tomato}" stroke-width="4" stroke-linecap="round"/></svg></span></div>
    <p class="text eyebrow">YOUR SHAREABLE GIFT WISHLIST</p>
    <h1 class="text">Good gifts<br>start with<br>a wishlist.</h1>
    <p class="text subline">Save your wishes. Share with friends.</p>
    <p class="text card-title">My wishlist</p>
    <p class="text item one">A little something</p>
    <p class="text item two">A big hint</p>
    <p class="text share">One link to share</p>
  </body></html>`);
  const fonts = await page.evaluate(async () => {
    const loaded = await Promise.all([
      document.fonts.load("800 80px BrandDisplay"),
      document.fonts.load("400 27px BrandBody"),
    ]);
    await document.fonts.ready;
    return loaded.map((faces) =>
      faces.map((face) => ({ family: face.family, status: face.status })),
    );
  });
  if (
    fonts.some((faces) => faces.length !== 1 || faces[0].status !== "loaded")
  ) {
    throw new Error(
      "Brand font failed to load; refusing to render fallback typography.",
    );
  }
  if (process.env.BRAND_SPECIMEN_HTML) {
    await writeFile(process.env.BRAND_SPECIMEN_HTML, await page.content());
  }
  await page.screenshot({
    path: join(out, "share-banner-v2.png"),
    animations: "disabled",
  });
  console.log("Verified loaded font faces:", JSON.stringify(fonts));
} finally {
  await browser.close();
}
console.log("Generated favicon, app/touch icons, and 1200×630 share banner.");
