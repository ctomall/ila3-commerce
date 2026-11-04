#!/usr/bin/env node
/**
 * Render the PNG icon set from the brand mark.
 *
 * SVG is the source of truth; browsers still want PNG for favicon/apple-touch.
 * Run with `yarn brand:assets` after changing public/brand/logo-mark.svg, and
 * commit the outputs so the build never depends on this step.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const src = path.join(root, 'public/brand/logo-mark.svg')
const outDir = path.join(root, 'public/brand')

if (!fs.existsSync(src)) {
  console.error('[brand-assets] missing public/brand/logo-mark.svg')
  process.exit(1)
}

const targets = [
  { name: 'favicon-16.png', size: 16 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'apple-touch-icon-180.png', size: 180 },
  { name: 'og-512.png', size: 512 },
]

for (const { name, size } of targets) {
  const out = path.join(outDir, name)
  await sharp(src, { density: 384 }).resize(size, size, { fit: 'contain' }).png().toFile(out)
  const { size: bytes } = fs.statSync(out)
  console.log(`[brand-assets] ${name} ${size}x${size} (${bytes} bytes)`)
}
