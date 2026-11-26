// SafariDrive launcher + PWA icon generator.
// Usage: bun android/tools/gen-icons.mjs
// Renders the brand car-front glyph at every required density with sharp.
// Outputs:
//   android/icons/<variant>/{48,72,96,144,192}.png   (launcher densities)
//   public/icons/icon-192.png, icon-512.png          (PWA, customer variant)
//   public/icons/maskable-512.png                    (full-bleed square)

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const variants = JSON.parse(readFileSync(resolve(ROOT, 'android/variants.json'), 'utf8'))

// Brand mark: rounded square + white car-front glyph (matches the web header mark)
export function iconSvg(color, { rx = 116 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rx}" fill="${color}"/>
  <rect x="116" y="160" width="280" height="136" rx="46" fill="#FFFFFF"/>
  <rect x="158" y="184" width="196" height="54" rx="20" fill="${color}"/>
  <rect x="150" y="260" width="212" height="10" rx="5" fill="${color}"/>
  <rect x="100" y="306" width="64" height="46" rx="16" fill="#FFFFFF"/>
  <rect x="348" y="306" width="64" height="46" rx="16" fill="#FFFFFF"/>
</svg>`
}

const DENSITIES = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
]

async function render(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size, { kernel: 'lanczos3' }).png().toFile(out)
}

for (const v of variants) {
  const dir = resolve(ROOT, `android/icons/${v.id}`)
  mkdirSync(dir, { recursive: true })
  const svg = iconSvg(v.color)
  for (const [, size] of DENSITIES) {
    await render(svg, size, resolve(dir, `${size}.png`))
  }
  console.log(`icons: ${v.id} -> 48/72/96/144/192`)
}

// PWA icons use the customer (brand) variant
const brand = variants.find((v) => v.id === 'customer')
const pwaDir = resolve(ROOT, 'public/icons')
mkdirSync(pwaDir, { recursive: true })
await render(iconSvg(brand.color), 192, resolve(pwaDir, 'icon-192.png'))
await render(iconSvg(brand.color), 512, resolve(pwaDir, 'icon-512.png'))
// Maskable: full-bleed square (no rounded transparency), glyph sits in the 80% safe zone
await render(iconSvg(brand.color, { rx: 0 }), 512, resolve(pwaDir, 'maskable-512.png'))
console.log('icons: pwa -> public/icons/{icon-192,icon-512,maskable-512}.png')
