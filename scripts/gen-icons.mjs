import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

/**
 * Generates Hajira's PWA icon set from one SVG source.
 * Brand: Peppercorn ink (#241C15) + Cavendish Yellow (#FFE01B) — same as the
 * login hero (ink tile, gold graduation cap). Full-bleed background so every
 * OS mask (circle, squircle, rounded) clips cleanly.
 *
 * Run: bun scripts/gen-icons.mjs
 */

const GOLD = '#FFE01B'
const GOLD_DEEP = '#E6C800'

// Lucide "GraduationCap" glyph, drawn on a 24x24 grid and scaled up.
function cap(scale) {
  const tx = 256 - 12 * scale
  const ty = 256 - 12 * scale
  return `
  <g transform="translate(${tx} ${ty}) scale(${scale})"
     fill="none" stroke="${GOLD}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"
          fill="${GOLD}" stroke="${GOLD_DEEP}"/>
    <path d="M22 10v6"/>
    <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>
  </g>`
}

const bg = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#241C15"/>
      <stop offset="0.55" stop-color="#3D332B"/>
      <stop offset="1" stop-color="#241C15"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>`

// Regular icons: cap fills most of the tile.
const regular = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${bg}${cap(11)}</svg>`

// Maskable: every part of the glyph stays inside the 80% safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${bg}${cap(8.2)}</svg>`

mkdirSync('public/icons', { recursive: true })

await sharp(Buffer.from(regular)).resize(512, 512).png().toFile('public/icons/icon-512.png')
await sharp(Buffer.from(regular)).resize(192, 192).png().toFile('public/icons/icon-192.png')
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile('public/icons/icon-maskable-512.png')
// iOS home screen rounds the corners itself — the padded variant survives that.
await sharp(Buffer.from(maskable)).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png')

console.log('PWA icons generated: icon-512, icon-192, icon-maskable-512, apple-touch-icon (180)')
