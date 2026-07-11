# Handoff: Funnel Page Builder Redesign

## Overview
A full redesign of the **Funnel page builder** in the Leadash admin — the screen where an admin edits an individual funnel page (hero, opt-in form, countdown, etc.) block by block. It keeps the familiar three-panel editor model (block library · canvas · properties) but modernizes the layout, interactions, and visual language into a polished dark editor where the funnel page being built "pops" against the chrome.

This **replaces the existing builder** at:
```
apps/web/src/app/(admin)/admin/funnels/[id]/pages/[pageId]/builder/page.tsx
```
The current builder is a dark 3-panel editor that only **appends** blocks to the bottom, has a flat text-only block list, a cramped properties panel, no inline (on-canvas) editing, and a placeholder A/B tab. This redesign addresses all of those.

## About the Design Files
The file in this bundle (`Funnel Builder.dc.html`) is a **design reference created in HTML** — a working prototype that shows the intended look and behavior. It is **not production code to copy directly**. It was authored as a self-contained component (a small custom runtime renders it via `React.createElement`), so the markup style will not match your codebase.

The task is to **recreate this design in the existing app environment**: Next.js (App Router) + React + TypeScript + Tailwind v4, following the patterns already used in the current `builder/page.tsx` and the rest of `apps/web`. Reuse the existing data layer (the funnel/page/block fetch + save endpoints the current builder already calls) — only the **UI and editing interactions** change.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interaction behavior in the prototype are the intended final design. Recreate the UI faithfully, but express it with your Tailwind tokens and existing component conventions rather than copying inline styles verbatim. Exact values are listed in **Design Tokens** below.

## Layout (Editor Shell)

A full-viewport flex column, `height: 100vh`, no page scroll. Background `#0a0e16`.

```
┌─────────────────────────────────────────────────────────────┐
│ TOP BAR  (53px)                                               │
│ ‹back │ funnel·page name + status │ device · zoom │ tools... │
├─────────────────────────────────────────────────────────────┤
│ A/B STRIP (only when A/B toggled on)                          │
├──────────┬───────────────────────────────────┬──────────────┤
│ LEFT     │ CANVAS (scrolls)                  │ RIGHT         │
│ 270px    │ flex:1                            │ 304px         │
│ Blocks / │ device-width page card, centered, │ Block props / │
│ Layers   │ insert zones between blocks       │ Page settings │
└──────────┴───────────────────────────────────┴──────────────┘
```
Left and right panels are hidden in Preview mode (canvas goes full width).

### Top bar (height 53px, bg `#0b1019`, bottom border `rgba(255,255,255,0.06)`)
- **Left cluster:** back chevron button (30×30, bg `rgba(255,255,255,0.05)`, radius 8) → returns to funnel detail; vertical divider; two stacked labels — funnel + sequence name in `#5b6678` 10.5px, page name ("Opt-in Page") in `#eaeff6` 13.5px/600; then a **status pill** (see below).
- **Center cluster:** device segmented control + zoom control.
- **Right cluster:** undo/redo pair, A/B toggle, Preview toggle, "Saved" indicator, Publish button.

**Status pill:** inline-flex, 10.5px/600, uppercase, radius 999, dot + label. Draft = amber (`bg rgba(245,158,11,.14)`, text `#fbbf24`, border `rgba(245,158,11,.3)`). Published = green (`bg rgba(34,197,94,.14)`, text `#4ade80`, border `rgba(34,197,94,.3)`).

**Device control:** segmented, bg `#0a0e16`, border `rgba(255,255,255,0.07)`, radius 9, 3px padding. Three icon buttons (desktop / tablet / mobile); active = `bg rgba(255,255,255,0.1)`, text `#eaeff6`; inactive text `#6b7280`. Selecting one changes the canvas card width (see Canvas).

**Zoom control:** same pill styling. `–` button, a center button showing `100%` in Geist Mono (click = reset to 100%), `+` button. Range 50%–150%, 10% steps.

**Undo/redo:** two 30×30 buttons, bg `rgba(255,255,255,0.05)`, radius 8. Disabled state text `#3a4252` (no pointer).

**A/B & Preview toggles:** pill buttons, 7px×12px padding, radius 9, 13px/500. Inactive: border `rgba(255,255,255,0.08)`, bg `rgba(255,255,255,0.04)`, text `#aeb6c2`. Active: border `accent+88`, bg `accent+1f` (12% alpha), text `#fcd9b6`. A/B = two-bars icon. Preview = eye icon (eye-off icon when active, label switches "Preview"↔"Exit").

**Saved indicator:** check icon + "Saved" in `#4b9e6a` 11.5px/500. (Wire to real autosave state.)

**Publish button:** gradient `linear-gradient(180deg,#fb923c,#f97316)`, white 13px/600, padding 8×16, radius 9, shadow `0 6px 16px -6px rgba(249,115,22,.6), inset 0 1px 0 rgba(255,255,255,.25)`, upload-arrow icon. Sets status → published and shows a toast.

### Left panel (width 270px — 244px in compact mode; bg `#0b101a`, right border `rgba(255,255,255,0.06)`)
Two tabs along the top (each flex:1, 12.5px/600, active has 2px bottom border in accent + text `#eaeff6`, inactive text `#6b7280`):

**Blocks tab:**
- Search input at top: bg `#0a0e16`, border `rgba(255,255,255,0.08)`, radius 9, padding `9px 10px 9px 34px`, leading magnifier icon at left 11px. Filters block cards live by label.
- Block cards grouped under uppercase 10px/600 `#5b6678` section headers, in this order:
  - **Layout:** Section, Columns, Spacer, Divider
  - **Text:** Headline, Paragraph, Bullet List
  - **Media:** Image, Video / VSL
  - **Conversion:** Hero, Opt-in Form, CTA Button, Countdown, Pricing, Testimonial, Stats Bar, FAQ
- Cards: 2-up grid, gap 8. Each card is a vertical icon (19px, stroke 1.6, color `#aeb6c2`) + label (11px/500 `#9aa4b2`), padding `13px 6px`, bg `rgba(255,255,255,0.025)`, border `rgba(255,255,255,0.06)`, radius 10. Hover: border `accent+99`, bg `accent+14`. `cursor: grab`.
- **Add behavior:** click a card → append that block to the end of the canvas + select it + toast "<Label> added". Drag a card → drop onto a canvas insert zone to place it at that index (see Canvas drag).

**Layers tab:**
- Uppercase header "Page structure".
- One row per block in document order: block icon + label + 1-based index (Geist Mono `#3a4252`). Click selects the block; hover bg `rgba(255,255,255,0.04)`; selected row bg `accent+1f`, border `accent+66`, text `#eaeff6`/600, icon in accent. Rows are draggable to reorder (same drop logic as canvas).

### Canvas (flex:1, scrolls; bg `radial-gradient(120% 80% at 50% 0, #11192b 0%, #0a0e16 55%)`)
- Centered **page card**: width depends on device — desktop **980px**, tablet **800px**, mobile **390px** (width transitions `.28s ease`). Card bg `#0c0c0f`, radius 14 (tablet 20, mobile 30), `overflow:hidden`, shadow `0 40px 90px -28px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,0.07)`. Canvas padding `34px 34px 140px`; card scaled by zoom via `transform: scale()` (origin top center).
- Card contains the ordered list of block elements, with an **insert zone** before the first, between each, and after the last.
- Clicking empty canvas / card background deselects.

**Block element (each block):**
- Wrapper is `position: relative`. On hover (not selected): `box-shadow: inset 0 0 0 1px accent+66`. On select: `inset 0 0 0 2px accent`.
- Selected block shows: an uppercase 9.5px/600 white-on-accent **type label** pinned top-left (radius bottom-right 7), and a floating **block toolbar** pinned top:-15 right:10.
- **Block toolbar:** bg `#161c28`, border `rgba(255,255,255,0.1)`, radius 9, shadow `0 8px 24px -6px rgba(0,0,0,.6)`. Buttons (each 26×26, icon 15, hover bg `rgba(255,255,255,0.08)`): drag-handle (6-dot grid, `cursor:grab`, starts a reorder drag) · move up · move down · duplicate · delete (delete icon red `#f87171`).

**Inline editing:** every text element in a block is `contentEditable` on the canvas (when not in Preview). Clicking text selects the block AND places the caret (the text node stops click propagation so it doesn't deselect). On blur, the edited text commits to that block's props (and pushes an undo entry). This is the headline feature vs. the current builder — copy is edited in place, not only in the right panel.

**Insert zone:** a thin (13px, 20px when active) full-width hover target between blocks. On hover or drag-over it shows a centered accent **+** button (22px circle); when a drag is over it, a 2.5px accent line with glow spans the width. Click an insert zone → inserts a Paragraph block at that index (a sensible default; could open a quick block picker instead). Drag-drop a library card or a block being reordered → places at that index.

**Drag & drop:** dragging a library card carries `{kind:'new', type}`; dragging a block handle/layer row carries `{kind:'move', id}`. The canvas tracks the nearest insert index on `dragover` (block elements split at their vertical midpoint). On drop: new → insert at index; move → relocate the block to that index.

### Right panel (width 304px — 280px compact; bg `#0b101a`, left border `rgba(255,255,255,0.06)`)
Header row (padding `13px 16px`, bottom border): 30×30 rounded icon tile + title + subtitle.
- **No selection → Page settings.** Icon tile bg `rgba(255,255,255,0.06)`. Sections (each led by an uppercase 10px/600 `#5b6678` label with a hairline underline):
  - **SEO & sharing:** Page title (input), Meta description (textarea), URL slug (input with leading `/` prefix segment, Geist Mono).
  - **Connection:** "On submit, send leads to" — radio list of options *Leadash Academy*, *Paystack*, *Redirect URL*, *None*. Selected option: bg `accent+1f`, border `accent+88`, custom radio dot in accent.
  - **Tracking:** Analytics / pixel ID (input).
- **Block selected → Block settings.** Icon tile bg `accent+1f`, icon in accent; close (×) button deselects. Body has a **Content** section then (where relevant) a **Style** section:
  - Field label: 11px/500 `#7c8aa0`, 6px below.
  - **Text input / textarea:** bg `#0a0e16`, border `rgba(255,255,255,0.09)`, radius 8, padding `8px 10px`, text `#e7ecf3` 13px. Editing here updates the canvas live (two-way bound with inline editing).
  - **Alignment control** (Headline, Paragraph): 3-button segmented (left/center/right icons), active button bg accent / white icon.
  - **Color control** (text color, accent color, background): a 34×34 swatch wrapping a native `<input type=color>` + a hex text input (Geist Mono).
  - **Number/slider** (Spacer height): range slider (accentColor = accent) + value readout in Geist Mono, range 8–160px.
  - **Repeatable items** (Stats, FAQ, Pricing features, Bullet list): list of compact rows each with a summary + a remove (`–`) button, plus a dashed "Add item" button (bg `accent+18`, border `accent+66`, text accent). Helper note: "Edit item text directly on the canvas."

  Per-block Content fields:
  - Hero: Eyebrow, Headline, Sub-headline, Button label
  - Countdown: Label · Video: Caption · CTA: Button label
  - Opt-in: Title, Button label, Fine print
  - Testimonial: Quote, Author, Role
  - Headline/Paragraph: Text · Pricing: Title, Price, Period, Button label, Features[]
  - Stats: items[{value,label}] · FAQ: items[{q,a}] · Bullet list: items[string] · Spacer: Height
  - Section/Columns/Divider/Image: no text content → show hint + Style only.

  Style fields shown conditionally: Alignment + Text color (Headline/Paragraph), Accent color (Countdown/CTA), Background (any block whose props include `bg`).

### A/B strip (only when A/B toggle is on; flex row, padding `9px 16px`, bg `#0e1320`, bottom border)
"A/B Test" label (two-bars icon, `#fcd9b6`) · **Variant A** chip (active: bg `accent+22`, border `accent+66`, "50%" in Geist Mono) · **Variant B** chip (muted) · dashed "Add variant" button · spacer · "Split traffic evenly · 0 visitors so far" · "Declare winner" button. This is the real A/B surface replacing the current placeholder; the prototype shows the layout/states — wire the variant CRUD + traffic stats to the backend.

### Preview mode
Hides both side panels; canvas card goes full width (max 1100px, radius 0, no shadow, blocks fill the viewport), all editing/selection chrome and insert zones disabled. A floating "Exit preview" button top-right of the canvas (bg `#161c28`, border `rgba(255,255,255,0.14)`).

### Toast
Centered bottom (24px up), bg `#1a2230`, border `rgba(255,255,255,0.12)`, radius 10, check icon in accent + message. Auto-dismiss ~2.2s. Used for add / duplicate / publish / A/B actions.

## Interactions & Behavior
- **Select:** click a block (or layer row) → selects, right panel shows its settings.
- **Deselect:** click canvas background or the × in the right-panel header.
- **Inline edit:** click any text in a block, type, blur to commit (also pushes undo).
- **Add block:** click a library card (appends + selects + toast) or drag it to an insert zone.
- **Insert between:** hover between blocks → **+**; click inserts default block; or drop a dragged item there.
- **Reorder:** drag a block's toolbar handle or a layer row; drop onto an insert zone. Also move up/down buttons in the block toolbar.
- **Duplicate / Delete:** block toolbar buttons (duplicate selects the copy + toast).
- **Undo/redo:** every structural change and committed text edit pushes history (cap ~60 entries); toolbar buttons enable/disable on availability.
- **Device:** changes canvas card width with a width transition; text blocks reflow (smaller hero type etc. at mobile widths).
- **Zoom:** scales the card 50–150%.
- **A/B / Preview / Publish:** as described above.
- **Autosave:** "Saved" indicator — connect to your existing save flow (debounced PATCH on change).

## State Management
Recreate with your existing data hooks; conceptually the editor needs:
- `blocks: Block[]` — ordered; each `{ id, type, props }`. Seeded from the page's saved layout. `props` shape is per-type (see Design Tokens / block list).
- `selectedId`, `hoverId` — selection / hover.
- `past[] / future[]` — undo/redo stacks of `blocks` snapshots.
- `device` ('desktop'|'tablet'|'mobile'), `zoom` (number), `preview` (bool), `ab` (bool).
- `leftTab` ('blocks'|'layers'), `search` (string).
- `status` ('draft'|'published'), transient `toast`.
- `page` — `{ title, desc, slug, connection, tracking }` for Page settings.
- Drag carrier (`{kind:'new',type}` | `{kind:'move',id}`) + current `dragInsert` index — these can be component refs/local state, not server state.

Persist `blocks` + `page` via the existing page-save endpoint; everything else is editor-local.

## Design Tokens
**Colors**
- Canvas/app bg: `#0a0e16` · panels: `#0b101a` / `#0b1019` · inputs & inset: `#0a0e16`, deeper `#08090d` / `#080b12`
- Page card / block default bg: `#0c0c0f` · opt-in/pricing card insets: `#0e1017`
- Toolbar/floating surface: `#161c28` · A/B strip: `#0e1320` · toast: `#1a2230`
- Borders: `rgba(255,255,255,0.06)` (chrome), `rgba(255,255,255,0.07–0.12)` (controls), dashed `rgba(255,255,255,0.1–0.18)`
- Text: primary `#eaeff6`/`#e7ecf3`, secondary `#cbd2dc`/`#9aa4b2`, tertiary `#7c8aa0`/`#8b95a3`, muted `#5b6678`/`#6b7280`, faint `#3a4252`
- **Accent (orange):** `#f97316`, gradient `linear-gradient(180deg,#fb923c,#f97316)`, light `#fb923c`, tint-on-dark text `#fcd9b6`. Tints used: `accent+14`,`+18`,`+1f`,`+22` (alpha) and borders `accent+66`,`+88`,`+99`. Accent is configurable.
- Success: `#4ade80` / `#4b9e6a` (green 34,197,94). Warn/draft: `#fbbf24` (amber 245,158,11). Danger: `#f87171`.

**Type:** Geist (400–800); Geist Mono for numerics (zoom %, slug, indices, stat chips). Notable sizes: page name 13.5/600, section headers 10/600 uppercase tracking .1em, field labels 11/500, body controls 13, hero H1 46 (mobile 29)/800 tracking -0.02em, hero sub 18 (15 mobile).

**Radius:** controls 6–9, cards 10–12, panels/large cards 14–18, pills 999. Page card 14 / tablet 20 / mobile 30.

**Shadows:** publish `0 6px 16px -6px rgba(249,115,22,.6), inset 0 1px 0 rgba(255,255,255,.25)`; floating toolbar `0 8px 24px -6px rgba(0,0,0,.6)`; page card `0 40px 90px -28px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,0.07)`; toast `0 16px 40px -10px rgba(0,0,0,.6)`.

**Spacing:** panel padding 12–16; control padding `8–9px ×10–13px`; canvas padding `34px 34px 140px`; insert zone height 13px (20 active).

**Configurable (prototype props):** accent color (default `#f97316`), starting device, compact panels (244/280px), layers-tab-first.

## Block types & default props (seed for the canvas)
Default page (in order): **Countdown, Hero, Stats Bar, Video/VSL, Opt-in Form, Testimonial, FAQ** — see `Funnel Builder.dc.html` (the `D` map = default props per type, `LABELS` = display names, `LIB` = library grouping, `ICONS` = the per-type SVG path sets). Each block renders its own styled markup inside the page card; reproduce these as React block components keyed by `type`. Copy in the prototype is themed to a "Leadash Academy · 30-Day Challenge" B2B-outreach funnel — replace with real data/placeholders as appropriate.

## Icons
All icons are inline SVG (24×24 viewBox, `currentColor`, round caps/joins, stroke ~1.6–2.4) — a Lucide-style set. Use your existing icon library (Lucide etc.); the `ICONS` map in the prototype lists the exact path data per block type if you want a 1:1 match.

## Assets
None external — no images or fonts beyond Geist / Geist Mono (Google Fonts). The video block uses a CSS gradient placeholder with a play button.

## Files
- `Funnel Builder.dc.html` — the full interactive design reference (open in a browser to click through it). The component logic (block defaults, library grouping, all interactions) lives in its `<script data-dc-script>` class.
- `preview-default.png` — editor with default page, nothing selected.
- `preview-block-selected.png` — Hero block selected, showing block toolbar + right-panel properties.

### Target file to replace
`apps/web/src/app/(admin)/admin/funnels/[id]/pages/[pageId]/builder/page.tsx`
Keep the existing route, params, data fetching, and save endpoints; replace the editor UI + interactions with this design.
