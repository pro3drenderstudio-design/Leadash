import { Block, BlockType, BlockLayout, isContainerType } from "./types";

export function genId(): string {
  return `b_${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultBlock(type: BlockType): Block {
  return { id: genId(), type, props: defaultProps(type), ...(isContainerType(type) ? { children: defaultChildren(type) } : {}) };
}

function defaultChildren(type: BlockType): Block[] {
  if (type === "row") {
    return [
      { id: genId(), type: "column", props: {}, layout: { width: { value: 50, unit: "%" } }, children: [] },
      { id: genId(), type: "column", props: {}, layout: { width: { value: 50, unit: "%" } }, children: [] },
    ];
  }
  return [];
}

export function defaultProps(type: BlockType): Record<string, unknown> {
  switch (type) {
    case "headline":       return { text:"A short, punchy headline", align:"center", color:"#ffffff", bg_color:"transparent", size:{ value:2.25, unit:"rem" }, weight:"bold" };
    case "body-text":      return { text:"Add supporting copy here. Click to edit this paragraph directly on the canvas.", align:"left", color:"#9aa4b2", bg_color:"transparent" };
    case "list":           return { items:[{text:"First key benefit"},{text:"Second key benefit"},{text:"Third key benefit"}], icon_type:"check", icon_color:"#f97316", text_color:"#d7dbe2", text_size:16, bg_color:"transparent" };
    case "icon-list":      return { items:[{text:"First item",icon_type:"check"},{text:"Second item",icon_type:"check"},{text:"Third item",icon_type:"check"}], icon_color:"#f97316", text_color:"#d7dbe2", text_size:16, bg_color:"transparent" };
    case "icon":           return { icon_type:"star", icon_color:"#f97316", icon_size:48, icon_bg:"rgba(249,115,22,0.12)", icon_bg_shape:"circle", align:"center", bg_color:"transparent" };
    case "icon-box":       return { icon_type:"bolt", icon_color:"#f97316", icon_size:32, icon_position:"top", title:"Feature title", body:"A short description of this feature or benefit.", title_color:"#ffffff", body_color:"#9aa4b2", title_size:18, body_size:15, link_text:"", link_url:"", bg_color:"transparent" };
    case "image":          return { src:"", alt:"", align:"center", width:"100%", bg_color:"transparent" };
    case "video":          return { url:"", caption:"Watch the 2-minute overview", bg_color:"#0c0c0f" };
    case "hero":           return { eyebrow:"7-Day Job & Client Acquisition Challenge", headline:"Land a Job or High-Paying Client in 7 Days", subtext:"A structured, hands-on challenge that takes you from zero to your first client or job offer — in just one week.", button_text:"Join the Challenge — ₦10,000 →", button_url:"#join-form", button2_text:"See What You'll Learn", button2_url:"#curriculum", accent_color:"#f97316", color:"#111827", subtext_color:"#4b5563", bg_color:"#ffffff" };
    case "countdown-timer":return { label:"Enrollment closes in · Only 50 spots per cohort", accent_color:"#f97316", bg_color:"#111827", evergreen:true, duration_minutes:2880, target_date:"" };
    case "testimonial":    return { quote:"This product completely changed how I approach outreach.", name:"Jane Doe", role:"Founder, AcmeCo", initials:"JD", result:"", card_bg:"rgba(255,255,255,0.03)", card_border:"rgba(255,255,255,0.07)", quote_color:"#e7ecf3", name_color:"#fff", role_color:"#7e8794", bg_color:"#0c0c0f" };
    case "pricing-card":   return { title:"Full Package", price:"₦135,000", period:"one-time", button_text:"Get Access", button_url:"", bg_color:"#0e1017", features:[{text:"Feature one"},{text:"Feature two"},{text:"Feature three"}] };
    case "faq-accordion":  return { bg_color:"#0c0c0f", item_bg:"rgba(255,255,255,0.03)", item_border:"rgba(255,255,255,0.07)", q_color:"#fff", a_color:"#9aa3b0", accent_color:"#f97316", show_number:false, items:[{q:"How does this work?",a:"You sign up and get instant access to everything."},{q:"Is there a guarantee?",a:"Yes — 30-day money back guarantee, no questions asked."}] };
    case "stats-bar":      return { bg_color:"#111827", value_color:"#ffffff", label_color:"#6b7280", items:[{value:"1,200+",label:"Students"},{value:"4.9★",label:"Avg rating"},{value:"30+",label:"Countries"}] };
    case "cta-button":     return { text:"Get Started Free", url:"", accent_color:"#f97316", bg_color:"transparent" };
    case "optin-form":     return { heading:"Join the 7-Day Challenge", subtext:"₦10,000 one-time · Lifetime access to community", section_label:"Secure Your Spot", section_heading:"Join the 7-Day Challenge", section_subtext:"₦10,000 · Spots limited to 50 per cohort", opay_account:"9021060638", opay_name:"Vescrow Solutions", amount_ngn:10000, wa_number:"2349110260332", accent_color:"#f97316", bg_color:"#f9fafb", show_paystack:true, confirmation_note:"Our community manager confirms within 2 hours and adds you to the WhatsApp group." };
    case "section":        return { bg_color:"#0c0c0f" };
    case "row":            return { bg_color:"transparent" };
    case "column":         return { bg_color:"transparent" };
    case "spacer":         return { height:48 };
    case "divider":        return { bg_color:"transparent" };
    case "custom-html":    return { html:"<p>Custom HTML goes here</p>" };
    case "info-card":      return { icon_type:"check", title:"Key benefit", body:"Explain why this matters in one or two sentences.", link_text:"", link_url:"", show_icon:true, card_bg:"rgba(255,255,255,0.03)", card_border:"rgba(255,255,255,0.07)", icon_color:"#f97316", title_color:"#ffffff", body_color:"#9aa4b2", radius:12, align:"left" };
    default:               return {};
  }
}

// ── Tree-shaped immutable mutation helpers ────────────────────────────────────
// All functions reconstruct only the array references along the changed path,
// leaving unrelated subtrees referentially identical (keeps undo/redo cheap).

function mapChildren(tree: Block[], parentId: string | null, fn: (children: Block[]) => Block[]): Block[] {
  if (parentId === null) return fn(tree);
  return tree.map(b => {
    if (b.id === parentId) return { ...b, children: fn(b.children ?? []) };
    if (b.children?.length) {
      const next = mapChildren(b.children, parentId, fn);
      if (next !== b.children) return { ...b, children: next };
    }
    return b;
  });
}

export interface Located { block: Block; parentId: string | null; index: number }

export function findBlock(tree: Block[], id: string): Block | null {
  for (const b of tree) {
    if (b.id === id) return b;
    if (b.children?.length) {
      const found = findBlock(b.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function locate(tree: Block[], id: string, parentId: string | null = null): Located | null {
  for (let i = 0; i < tree.length; i++) {
    const b = tree[i];
    if (b.id === id) return { block: b, parentId, index: i };
    if (b.children?.length) {
      const found = locate(b.children, id, b.id);
      if (found) return found;
    }
  }
  return null;
}

export function parentChain(tree: Block[], id: string): Block[] {
  const chain: Block[] = [];
  let current = locate(tree, id);
  while (current && current.parentId) {
    const parent = findBlock(tree, current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = locate(tree, parent.id);
  }
  return chain;
}

function isDescendant(block: Block, maybeAncestorId: string): boolean {
  if (block.id === maybeAncestorId) return true;
  return (block.children ?? []).some(c => isDescendant(c, maybeAncestorId));
}

export function insertBlock(tree: Block[], parentId: string | null, index: number, block: Block): Block[] {
  return mapChildren(tree, parentId, children => {
    const next = [...children];
    next.splice(index, 0, block);
    return next;
  });
}

export function moveBlock(tree: Block[], id: string, newParentId: string | null, newIndex: number): Block[] {
  const current = locate(tree, id);
  if (!current) return tree;
  if (newParentId !== null) {
    if (newParentId === id) return tree;
    if (isDescendant(current.block, newParentId)) return tree;
  }

  let removed: Block | null = null;
  let withoutBlock = mapChildren(tree, current.parentId, children => {
    const next = [...children];
    const [x] = next.splice(current.index, 1);
    removed = x;
    return next;
  });
  if (!removed) return tree;

  // Adjust target index if moving within the same parent and the removal shifted indices.
  let targetIndex = newIndex;
  if (current.parentId === newParentId && current.index < newIndex) targetIndex -= 1;

  withoutBlock = mapChildren(withoutBlock, newParentId, children => {
    const next = [...children];
    next.splice(targetIndex, 0, removed as Block);
    return next;
  });
  return withoutBlock;
}

export function removeBlock(tree: Block[], id: string): Block[] {
  const current = locate(tree, id);
  if (!current) return tree;
  return mapChildren(tree, current.parentId, children => children.filter(b => b.id !== id));
}

export function cloneWithNewIds(block: Block): Block {
  return {
    ...block,
    id: genId(),
    props: JSON.parse(JSON.stringify(block.props)),
    layout: block.layout ? JSON.parse(JSON.stringify(block.layout)) : undefined,
    children: block.children ? block.children.map(cloneWithNewIds) : undefined,
  };
}

export function duplicateBlock(tree: Block[], id: string): { tree: Block[]; newId: string | null } {
  const current = locate(tree, id);
  if (!current) return { tree, newId: null };
  const clone = cloneWithNewIds(current.block);
  const next = mapChildren(tree, current.parentId, children => {
    const arr = [...children];
    arr.splice(current.index + 1, 0, clone);
    return arr;
  });
  return { tree: next, newId: clone.id };
}

export function updateBlockProps(tree: Block[], id: string, patch: Record<string, unknown>): Block[] {
  const current = locate(tree, id);
  if (!current) return tree;
  return mapChildren(tree, current.parentId, children =>
    children.map(b => (b.id === id ? { ...b, props: { ...b.props, ...patch } } : b)),
  );
}

export function updateBlockLayout(tree: Block[], id: string, patch: Partial<BlockLayout>): Block[] {
  const current = locate(tree, id);
  if (!current) return tree;
  return mapChildren(tree, current.parentId, children =>
    children.map(b => (b.id === id ? { ...b, layout: { ...b.layout, ...patch } } : b)),
  );
}

export function updateBlockItem(tree: Block[], id: string, idx: number, field: string | null, val: string): Block[] {
  const current = locate(tree, id);
  if (!current) return tree;
  return mapChildren(tree, current.parentId, children =>
    children.map(b => {
      if (b.id !== id) return b;
      const items = [...((b.props.items as unknown[]) ?? [])];
      items[idx] = field === null ? val : { ...(items[idx] as Record<string, unknown>), [field]: val };
      return { ...b, props: { ...b.props, items } };
    }),
  );
}

export function addBlockItem(tree: Block[], id: string, item: unknown): Block[] {
  const current = locate(tree, id);
  if (!current) return tree;
  return mapChildren(tree, current.parentId, children =>
    children.map(b => (b.id === id ? { ...b, props: { ...b.props, items: [...((b.props.items as unknown[]) ?? []), item] } } : b)),
  );
}

export function removeBlockItem(tree: Block[], id: string, idx: number): Block[] {
  const current = locate(tree, id);
  if (!current) return tree;
  return mapChildren(tree, current.parentId, children =>
    children.map(b => (b.id === id ? { ...b, props: { ...b.props, items: ((b.props.items as unknown[]) ?? []).filter((_, j) => j !== idx) } } : b)),
  );
}

export function setColumnPreset(tree: Block[], rowId: string, widths: number[]): Block[] {
  const row = findBlock(tree, rowId);
  if (!row) return tree;
  const existing = row.children ?? [];
  const next: Block[] = widths.map((w, i) => {
    const prior = existing[i];
    if (prior) return { ...prior, layout: { ...prior.layout, width: { value: w, unit: "%" } } };
    return { id: genId(), type: "column", props: {}, layout: { width: { value: w, unit: "%" } }, children: [] };
  });
  return mapChildren(tree, rowId, () => next);
}

export function walkBlocks(tree: Block[], fn: (block: Block, depth: number, parentId: string | null) => void, depth = 0, parentId: string | null = null): void {
  for (const b of tree) {
    fn(b, depth, parentId);
    if (b.children?.length) walkBlocks(b.children, fn, depth + 1, b.id);
  }
}

export function normalizeLegacyBlocks(tree: unknown[]): Block[] {
  return (tree as Array<Record<string, unknown>>).map(raw => {
    if (raw.type === "two-column") {
      const props = (raw.props as Record<string, unknown>) ?? {};
      return {
        id: raw.id as string,
        type: "row" as BlockType,
        props: { bg_color: props.bg_color ?? "transparent" },
        children: [
          { id: genId(), type: "column" as BlockType, props: {}, layout: { width: { value: 50, unit: "%" } },
            children: [{ id: genId(), type: "body-text" as BlockType, props: { text: props.left ?? "", align: "left", color: "#cbd2dc", bg_color: "transparent" } }] },
          { id: genId(), type: "column" as BlockType, props: {}, layout: { width: { value: 50, unit: "%" } },
            children: [{ id: genId(), type: "body-text" as BlockType, props: { text: props.right ?? "", align: "left", color: "#cbd2dc", bg_color: "transparent" } }] },
        ],
      };
    }
    const block = raw as unknown as Block;
    return { ...block, children: block.children ? normalizeLegacyBlocks(block.children) : block.children };
  });
}
