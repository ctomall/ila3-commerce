/**
 * Single source of truth for the product's user-facing brand.
 *
 * The original upstream brand must not appear in any user-visible surface
 * (HTML title, i18n dictionaries, navigation, API docs). Everything renders
 * from here (or from NEXT_PUBLIC_BRAND_* env vars), so a future rename is a
 * one-line change instead of a repo-wide search.
 *
 * NOTE: `@open-mercato/*` package imports are third-party module specifiers and
 * are intentionally NOT renamed by this branding layer.
 */
export const BRAND = {
  /** Full product name shown in <title>, login page and API docs. */
  name: process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || 'ILA3 Commerce',
  /** Short form for compact UI slots (sidebar collapse, mobile header). */
  shortName: process.env.NEXT_PUBLIC_BRAND_SHORT_NAME?.trim() || 'ILA3',
  /** One-line product description used as the meta description / API blurb. */
  description:
    process.env.NEXT_PUBLIC_BRAND_DESCRIPTION?.trim() ||
    'Modular B2B commerce and ERP workspace',
  /** Favicon/app icon served from /public. */
  icon: '/brand.svg',
  /** Repository/package slug (no spaces). */
  slug: 'ila3-commerce',
} as const

export type Brand = typeof BRAND
