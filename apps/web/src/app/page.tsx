/**
 * Root landing — now renders the v2 design. The previous gradient-heavy
 * landing is preserved at `_legacy_landing.tsx.bak` for reference until
 * we're confident the cutover holds, then it can be deleted.
 *
 * `/v2` and `/v2/*` continue to render the same components as their
 * cleaned-up sister routes, so any inbound link from staging previews
 * keeps working.
 */

export { default, metadata } from "./v2/page";
