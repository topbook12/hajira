import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

/**
 * Generates Hajira's PWA icon set from one SVG source.
 *
 * Icon story (the product in one tile):
 *   - dark peppercorn tile (the app's signature hero)
 *   - a thin radar ring with ONE bright gold arc = the rotating QR that
 *     refreshes every 30 seconds
 *   - the gold graduation cap = the classroom
 *   - a gold "verified" check badge = attendance recorded
 *
 * Brand: Peppercorn ink (#241C15) + Cavendish Yellow (#FFE01B) — same as the
 * login hero. Full-bleed background so every OS mask (circle, squircle,
 * rounded) clips cleanly.
 *
 * Run: bun scripts/gen-icons.mjs
 */

const GOLD = '#FFE01B'
const GOLD_DEEP = '#E6C800'
const INK = '#241C15'

// Lucide "GraduationCap" glyph on a 24x24 grid, scaled up.
function cap(scale, strokeW = 2) {
  const tx = 256 - 12 * scale
  const ty = 256 - 11 * scale
  return `
  <g transform="translate(${tx} ${ty}) scale(${scale})"
     fill="none" stroke="${GOLD_DEEP}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"
          fill="${GOLD}" stroke="${GOLD_DEEP}"/>
    <path d="M22 10v6"/>
    <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>
  </g>`
}

/** Gold verified badge with an ink check — "attendance recorded". */
function badge(cx, cy, r) {
  return `
  <g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${GOLD}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-opacity="0.25" stroke-width="${r * 0.09}"/>
    <path d="M ${cx - r * 0.46} ${cy + r * 0.02} L ${cx - r * 0.1} ${cy + r * 0.38} L ${cx + r * 0.5} ${cy - r * 0.34}"
          fill="none" stroke="${INK}" stroke-width="${r * 0.28}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`
}

function scene({ ringR, capScale, badgeR, badgeX, badgeY, arcDash }) {
  const circ = 2 * Math.PI * ringR
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#241C15"/>
      <stop offset="0.55" stop-color="#3D332B"/>
      <stop offset="1" stop-color="#241C15"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <!-- rotating-QR radar: faint full ring + one bright gold arc -->
  <circle cx="256" cy="256" r="${ringR}" fill="none" stroke="#FFE01B" stroke-opacity="0.16" stroke-width="10"/>
  <circle cx="256" cy="256" r="${ringR}" fill="none" stroke="${GOLD}" stroke-width="10"
          stroke-linecap="round" stroke-dasharray="${arcDash} ${circ - arcDash}"
          transform="rotate(-56 256 256)"/>
  ${cap(capScale)}
  ${badge(badgeX, badgeY, badgeR)}`
}

// Regular icons: full-bleed, cap + ring + badge.
const regular = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${scene({
  ringR: 186,
  capScale: 9.6,
  badgeR: 62,
  badgeX: 380,
  badgeY: 380,
  arcDash: 300,
})}</svg>`

// Maskable: everything wrapped to the 80% safe zone.
const inner = scene({
  ringR: 186,
  capScale: 9.6,
  badgeR: 62,
  badgeX: 380,
  badgeY: 380,
  arcDash: 300,
})
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#241C15"/>
      <stop offset="0.55" stop-color="#3D332B"/>
      <stop offset="1" stop-color="#241C15"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(0.78) translate(-256 -256)">${inner.replace(/<defs>[\s\S]*?<\/defs>/, '').replace('<rect width="512" height="512" fill="url(#bg)"/>', '')}</g>
</svg>`

mkdirSync('public/icons', { recursive: true })

await sharp(Buffer.from(regular)).resize(512, 512).png().toFile('public/icons/icon-512.png')
await sharp(Buffer.from(regular)).resize(192, 192).png().toFile('public/icons/icon-192.png')
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile('public/icons/icon-maskable-512.png')
// iOS home screen rounds the corners itself — the padded variant survives that.
await sharp(Buffer.from(maskable)).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png')

console.log('PWA icons generated: icon-512, icon-192, icon-maskable-512, apple-touch-icon (180)')
