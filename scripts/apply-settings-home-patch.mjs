import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The stock /backend/settings page is only a placeholder ("Select an item from
 * the menu"). Redirect it to the app-owned settings home at
 * /backend/config/home, which renders the searchable card grid.
 *
 * Idempotent; run after reinstalling dependencies (next build reads this dist
 * file directly). The page remains a client component so the redirect happens
 * once the settings shell has mounted.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(
  root,
  'node_modules',
  '@open-mercato',
  'core',
  'dist',
  'modules',
  'auth',
  'backend',
  'settings',
  'page.js',
)

if (!existsSync(file)) {
  console.error(`core settings page not found at ${file}`)
  process.exit(1)
}

const source = readFileSync(file, 'utf8')
if (source.includes('/backend/config/home')) {
  console.log('settings home redirect: already patched')
  process.exit(0)
}

const backup = `${file}.settings-home.bak`
if (!existsSync(backup)) copyFileSync(file, backup)

const patched = `"use client";
import { useEffect } from "react";
function SettingsPage() {
  useEffect(() => {
    window.location.replace("/backend/config/home");
  }, []);
  return null;
}
export {
  SettingsPage as default
};
`

writeFileSync(file, patched)
console.log('settings home redirect: patched')
