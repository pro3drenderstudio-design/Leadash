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
    case "list":           return { items:[{text:"First key benefit"},{text:"Second key benefit"},{text:"Third key benefit"}], bg_color:"transparent" };
    case "image":          return { src:"", alt:"", bg_color:"transparent" };
    case "video":          return { url:"", caption:"Watch the 2-minute overview", bg_color:"#0c0c0f" };
    case "hero":           return { eyebrow:"FREE · 30-DAY CHALLENGE", headline:"Your Compelling Headline Here", subtext:"Your subheadline that builds interest and drives action.", button_text:"Get Started Free", button_url:"", bg_color:"#0c0c0f" };
    case "countdown-timer":return { label:"Enrollment closes in", accent_color:"#f97316", bg_color:"#14161c", evergreen:true, duration_minutes:30, target_date:"" };
    case "testimonial":    return { quote:"This product completely changed how I approach outreach.", name:"Jane Doe", role:"Founder, AcmeCo", bg_color:"#0c0c0f" };
    case "pricing-card":   return { title:"Full Package", price:"₦135,000", period:"one-time", button_text:"Get Access", button_url:"", bg_color:"#0e1017", features:[{text:"Feature one"},{text:"Feature two"},{text:"Feature three"}] };
    case "faq-accordion":  return { bg_color:"#0c0c0f", items:[{q:"How does this work?",a:"You sign up and get instant access to everything."},{q:"Is there a guarantee?",a:"Yes — 30-day money back guarantee, no questions asked."}] };
    case "stats-bar":      return { bg_color:"#0c0c0f", items:[{value:"1,200+",label:"Customers"},{value:"4.9",label:"Avg rating"},{value:"30+",label:"Countries"}] };
    case "cta-button":     return { text:"Get Started Free", url:"", accent_color:"#f97316", bg_color:"#0c0c0f" };
    case "optin-form":     return { title:"Get instant free access", button_text:"Send Me Access", fine_print:"No spam. Unsubscribe anytime.", bg_color:"#0e1017", redirect_url:"", fields:[{type:"name",label:"Full name",required:false},{type:"email",label:"Email address",required:true}] };
    case "section":        return { bg_color:"#0c0c0f" };
    case "row":            return { bg_color:"transparent" };
    case "column":         return { bg_color:"transparent" };
    case "spacer":         return { height:48 };
    case "divider":        return { bg_color:"transparent" };
    case "custom-html":    return { html:"<p>Custom HTML goes here</p>" };
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
