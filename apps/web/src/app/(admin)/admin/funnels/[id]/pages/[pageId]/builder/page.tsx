"use client";
import React, { useEffect, useState, useReducer, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

type BlockType =
  | "section" | "two-column" | "spacer" | "divider"
  | "headline" | "body-text" | "list"
  | "image" | "video"
  | "hero" | "countdown-timer" | "testimonial" | "pricing-card" | "faq-accordion" | "stats-bar"
  | "cta-button" | "optin-form" | "custom-html";

interface Block { id: string; type: BlockType; props: Record<string, unknown> }
type Device = "desktop" | "tablet" | "mobile";
type DragCarrier = { kind: "new"; type: BlockType } | { kind: "move"; id: string } | null;

interface PageData {
  id: string; funnel_id: string; name: string; slug: string;
  step_order: number; page_type: string; status: "draft" | "published";
  blocks: Block[]; settings: Record<string, unknown>;
  connection: { type?: string; plan_id?: string; product?: string; url?: string };
}

// ── History reducer ────────────────────────────────────────────────────────────

type HistState = { blocks: Block[]; past: Block[][]; future: Block[][] };
type HistAction =
  | { type: "commit"; next: Block[] }
  | { type: "setLive"; next: Block[] }
  | { type: "undo" }
  | { type: "redo" };

function histReducer(s: HistState, a: HistAction): HistState {
  switch (a.type) {
    case "commit":  return { blocks: a.next, past: [...s.past, s.blocks].slice(-60), future: [] };
    case "setLive": return { ...s, blocks: a.next };
    case "undo":    return s.past.length ? { blocks: s.past[s.past.length-1], past: s.past.slice(0,-1), future: [s.blocks, ...s.future] } : s;
    case "redo":    return s.future.length ? { blocks: s.future[0], past: [...s.past, s.blocks], future: s.future.slice(1) } : s;
    default: return s;
  }
}

// ── Block library ──────────────────────────────────────────────────────────────

const LABELS: Record<BlockType, string> = {
  "section":"Section","two-column":"Columns","spacer":"Spacer","divider":"Divider",
  "headline":"Headline","body-text":"Paragraph","list":"Bullet List",
  "image":"Image","video":"Video / VSL",
  "hero":"Hero","countdown-timer":"Countdown","testimonial":"Testimonial",
  "pricing-card":"Pricing","faq-accordion":"FAQ","stats-bar":"Stats Bar",
  "cta-button":"CTA Button","optin-form":"Opt-in Form","custom-html":"Custom HTML",
};

const ICONS: Partial<Record<BlockType, string[]>> = {
  "countdown-timer":["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z","M12 8v4l3 2"],
  "hero":           ["M3 4h18v7H3z","M6 15h7","M6 18h4"],
  "stats-bar":      ["M5 20V11","M12 20V4","M19 20v-7"],
  "video":          ["M3 5h18v14H3z","M10 9l5 3-5 3z"],
  "optin-form":     ["M4 6h16v12H4z","M4 10h16","M7 14h6"],
  "testimonial":    ["M5 4h14v11H9l-4 4z","M8 8h8","M8 11h5"],
  "faq-accordion":  ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z","M9.6 9a2.4 2.4 0 1 1 3 2.3c-.8.4-1 .8-1 1.5","M12 16h.01"],
  "headline":       ["M5 6h14","M12 6v12"],
  "body-text":      ["M5 6h14","M5 10h14","M5 14h9"],
  "list":           ["M9 6h11","M9 12h11","M9 18h11","M4.5 6h.01","M4.5 12h.01","M4.5 18h.01"],
  "image":          ["M3 5h18v14H3z","M3 16l5-5 4 4 3-3 6 6"],
  "cta-button":     ["M3 9h18v6H3z"],
  "pricing-card":   ["M6 3h9l3 3v15H6z","M9 9h6","M9 13h6","M9 17h4"],
  "divider":        ["M3 12h18"],
  "spacer":         ["M3 5h18","M3 19h18","M12 8v8"],
  "section":        ["M3 4h18v16H3z"],
  "two-column":     ["M4 4h7v16H4z","M13 4h7v16h-7z"],
  "custom-html":    ["M10 20l4-16","M6.5 7.5l-4 4 4 4","M17.5 16.5l4-4-4-4"],
};

const LIB_GROUPS: { group: string; types: BlockType[] }[] = [
  { group:"Layout",     types:["section","two-column","spacer","divider"] },
  { group:"Text",       types:["headline","body-text","list"] },
  { group:"Media",      types:["image","video"] },
  { group:"Conversion", types:["hero","optin-form","cta-button","countdown-timer","pricing-card","testimonial","stats-bar","faq-accordion"] },
  { group:"Other",      types:["custom-html"] },
];

function genId() { return `b_${Math.random().toString(36).slice(2,9)}`; }

function defaultProps(type: BlockType): Record<string, unknown> {
  switch (type) {
    case "headline":       return { text:"A short, punchy headline", align:"center", color:"#ffffff", bg_color:"transparent", size:"4xl", weight:"bold" };
    case "body-text":      return { text:"Add supporting copy here. Click to edit this paragraph directly on the canvas.", align:"left", color:"#9aa4b2", bg_color:"transparent" };
    case "list":           return { items:["First key benefit","Second key benefit","Third key benefit"], bg_color:"transparent" };
    case "image":          return { src:"", alt:"", bg_color:"transparent" };
    case "video":          return { url:"", caption:"Watch the 2-minute overview", bg_color:"#0c0c0f" };
    case "hero":           return { eyebrow:"FREE · 30-DAY CHALLENGE", headline:"Your Compelling Headline Here", subtext:"Your subheadline that builds interest and drives action.", cta_text:"Get Started Free", cta_url:"", bg_color:"#0c0c0f" };
    case "countdown-timer":return { label:"Enrollment closes in", accent_color:"#f97316", bg_color:"#14161c", evergreen:true, duration_minutes:30, target_date:"" };
    case "testimonial":    return { quote:"This product completely changed how I approach outreach.", author:"Jane Doe", role:"Founder, AcmeCo", bg_color:"#0c0c0f" };
    case "pricing-card":   return { title:"Full Package", price:"₦135,000", period:"one-time", cta_text:"Get Access", cta_url:"", bg_color:"#0e1017", features:["Feature one","Feature two","Feature three"] };
    case "faq-accordion":  return { bg_color:"#0c0c0f", items:[{q:"How does this work?",a:"You sign up and get instant access to everything."},{q:"Is there a guarantee?",a:"Yes — 30-day money back guarantee, no questions asked."}] };
    case "stats-bar":      return { bg_color:"#0c0c0f", items:[{value:"1,200+",label:"Customers"},{value:"4.9",label:"Avg rating"},{value:"30+",label:"Countries"}] };
    case "cta-button":     return { text:"Get Started Free", url:"", accent_color:"#f97316", bg_color:"#0c0c0f" };
    case "optin-form":     return { title:"Get instant free access", button_text:"Send Me Access", fine_print:"No spam. Unsubscribe anytime.", bg_color:"#0e1017", redirect_url:"", fields:[{type:"name",label:"Full name",required:false},{type:"email",label:"Email address",required:true}] };
    case "section":        return { bg_color:"#0c0c0f" };
    case "two-column":     return { bg_color:"#0c0c0f", left:"Left column content", right:"Right column content" };
    case "spacer":         return { height:48 };
    case "divider":        return { bg_color:"transparent" };
    case "custom-html":    return { html:"<p>Custom HTML goes here</p>" };
    default:               return {};
  }
}

// ── SVG Icon ───────────────────────────────────────────────────────────────────

function Icon({ paths, size=16, sw=1.8 }: { paths:string[]; size?:number; sw?:number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d,i)=><path key={i} d={d}/>)}
    </svg>
  );
}

function BlockIcon({ type, size=16 }: { type:BlockType; size?:number }) {
  return <Icon paths={ICONS[type]??["M4 4h16v16H4z"]} size={size} sw={1.7} />;
}

// ── Editable (inline contentEditable) ─────────────────────────────────────────

interface EditableProps {
  tag?: keyof React.JSX.IntrinsicElements;
  value: string;
  editable: boolean;
  style?: React.CSSProperties;
  onCommit: (val:string) => void;
  onFocus?: () => void;
}

function Editable({ tag="div", value, editable, style, onCommit, onFocus }: EditableProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== (value??"")) el.textContent = value??"";
  }, [value]);

  const props: Record<string, unknown> = {
    ref,
    contentEditable: editable || undefined,
    suppressContentEditableWarning: true,
    spellCheck: false,
    style: { ...style, outline:"none", cursor: editable ? "text" : undefined },
  };
  if (editable) {
    props.onMouseDown = (e: React.MouseEvent) => { e.stopPropagation(); onFocus?.(); };
    props.onClick     = (e: React.MouseEvent) => e.stopPropagation();
    props.onBlur      = (e: React.FocusEvent<HTMLElement>) => onCommit(e.currentTarget.textContent??"");
  }
  return React.createElement(tag as string, props);
}

// ── Block Content ──────────────────────────────────────────────────────────────

interface BContentProps {
  block: Block; device: Device; preview: boolean;
  onCommitProp: (key:string, val:string) => void;
  onFocus: () => void;
  onCommitItem: (idx:number, field:string|null, val:string) => void;
}

function BlockContent({ block, device, preview, onCommitProp, onFocus, onCommitItem }: BContentProps) {
  const p = block.props;
  const mob = device === "mobile";
  const ed = !preview;
  const ac = (p.accent_color as string) ?? "#f97316";
  const bg = (p.bg_color as string) || "transparent";

  const E = ({ tag="div", k, style }: { tag?:keyof React.JSX.IntrinsicElements; k:string; style:React.CSSProperties }) => (
    <Editable tag={tag} value={(p[k] as string)??""} editable={ed} style={style}
      onCommit={v => onCommitProp(k, v)} onFocus={onFocus} />
  );

  switch (block.type) {
    case "countdown-timer":
      return (
        <div style={{background:bg,padding:"13px 20px",display:"flex",alignItems:"center",justifyContent:"center",gap:16,flexWrap:"wrap",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
          <E k="label" style={{color:"#aeb6c2",fontSize:13,fontWeight:500}} />
          <div style={{display:"flex",gap:7}}>
            {[["02","Days"],["11","Hrs"],["46","Min"],["09","Sec"]].map(([v,l])=>(
              <div key={l} style={{textAlign:"center"}}>
                <div style={{background:ac,color:"#fff",fontWeight:700,fontSize:17,borderRadius:7,padding:"5px 9px",minWidth:42,fontVariantNumeric:"tabular-nums"}}>{v}</div>
                <div style={{color:"#6b7280",fontSize:8.5,marginTop:3,textTransform:"uppercase",letterSpacing:".08em"}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      );

    case "hero":
      return (
        <div style={{background:bg,padding:mob?"46px 24px 40px":"66px 32px 56px",textAlign:"center"}}>
          <div style={{display:"inline-block",background:"rgba(249,115,22,.12)",color:"#fb923c",fontSize:11.5,fontWeight:600,letterSpacing:".1em",padding:"6px 13px",borderRadius:999,marginBottom:22}}>
            {(p.eyebrow as string)||"FREE · 30-DAY CHALLENGE"}
          </div>
          <E tag="h1" k="headline" style={{fontSize:mob?29:46,lineHeight:1.07,fontWeight:800,color:"#fff",maxWidth:760,margin:"0 auto 18px",letterSpacing:"-0.02em",display:"block"}} />
          <E tag="p" k="subtext" style={{fontSize:mob?15:18,lineHeight:1.6,color:"#9aa4b2",maxWidth:560,margin:"0 auto 30px",display:"block"}} />
          <div style={{display:"flex",justifyContent:"center"}}>
            <E tag="span" k="cta_text" style={{display:"inline-flex",background:"linear-gradient(180deg,#fb923c,#f97316)",color:"#fff",fontWeight:700,fontSize:16,padding:"15px 34px",borderRadius:11,boxShadow:"0 12px 28px -8px rgba(249,115,22,.55)"}} />
          </div>
          <p style={{color:"#5b6678",fontSize:12,marginTop:15}}>Join 1,200+ founders · No card required</p>
        </div>
      );

    case "stats-bar": {
      const items = (p.items as Array<{value:string;label:string}>)??[];
      return (
        <div style={{background:bg,padding:"10px 32px 46px",display:"flex",justifyContent:"center",gap:mob?22:64,flexWrap:"wrap"}}>
          {items.map((it,idx)=>(
            <div key={idx} style={{textAlign:"center"}}>
              <Editable tag="div" value={it.value} editable={ed} style={{fontSize:34,fontWeight:800,color:"#fb923c",letterSpacing:"-0.01em"}}
                onCommit={v=>onCommitItem(idx,"value",v)} onFocus={onFocus} />
              <Editable tag="div" value={it.label} editable={ed} style={{fontSize:12.5,color:"#8b95a3",marginTop:4}}
                onCommit={v=>onCommitItem(idx,"label",v)} onFocus={onFocus} />
            </div>
          ))}
        </div>
      );
    }

    case "video":
      return (
        <div style={{background:bg,padding:"8px 32px 42px"}}>
          <div style={{maxWidth:680,margin:"0 auto"}}>
            <div style={{aspectRatio:"16/9",borderRadius:14,background:"linear-gradient(135deg,#1a1f2b,#0f1622)",border:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{width:64,height:64,borderRadius:999,background:"rgba(249,115,22,.96)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 12px 32px -6px rgba(249,115,22,.6)"}}>
                <Icon paths={["M9 6l9 6-9 6z"]} size={24} sw={1} />
              </div>
            </div>
            <E tag="p" k="caption" style={{textAlign:"center",color:"#8b95a3",fontSize:13,marginTop:13,display:"block"}} />
          </div>
        </div>
      );

    case "optin-form": {
      const fields = (p.fields as Array<{type:string;label:string;required:boolean}>) ?? [];
      return (
        <div style={{background:bg,padding:mob?"40px 22px":"50px 32px"}}>
          <div style={{maxWidth:430,margin:"0 auto",background:"#0c0c0f",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,padding:"30px 26px",boxShadow:"0 24px 60px -24px rgba(0,0,0,.75)"}}>
            <E tag="h3" k="title" style={{fontSize:22,fontWeight:700,color:"#fff",textAlign:"center",marginBottom:18,display:"block"}} />
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {fields.length>0
                ? fields.map((f,idx)=>(
                  <div key={idx} style={{border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 13px",color:"#5b6678",fontSize:14,background:"#08090d"}}>
                    {f.label||f.type}{f.required&&" *"}
                  </div>
                ))
                : <div style={{border:"1px dashed rgba(249,115,22,.5)",borderRadius:10,padding:"12px 13px",color:"#fb923c",fontSize:12,background:"#08090d"}}>No fields configured — add fields in the settings panel</div>
              }
              <E tag="div" k="button_text" style={{background:"linear-gradient(180deg,#fb923c,#f97316)",color:"#fff",fontWeight:700,fontSize:15,padding:"13px",borderRadius:10,textAlign:"center",boxShadow:"0 8px 20px -8px rgba(249,115,22,.6)"}} />
            </div>
            <E tag="p" k="fine_print" style={{textAlign:"center",color:"#5b6678",fontSize:11,marginTop:13,display:"block"}} />
          </div>
        </div>
      );
    }

    case "testimonial":
      return (
        <div style={{background:bg,padding:"46px 32px"}}>
          <div style={{maxWidth:600,margin:"0 auto",textAlign:"center"}}>
            <div style={{color:"#f97316",fontSize:34,lineHeight:0.6,marginBottom:14,fontFamily:"Georgia,serif"}}>&ldquo;</div>
            <E tag="p" k="quote" style={{fontSize:mob?18:22,lineHeight:1.5,color:"#e7ecf3",fontWeight:500,marginBottom:22,display:"block"}} />
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
              <div style={{width:44,height:44,borderRadius:999,background:"linear-gradient(135deg,#fb923c,#b45309)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,flexShrink:0}}>
                {((p.author as string)||"A").trim()[0]||"A"}
              </div>
              <div style={{textAlign:"left"}}>
                <E tag="div" k="author" style={{color:"#fff",fontWeight:600,fontSize:14}} />
                <E tag="div" k="role"   style={{color:"#8b95a3",fontSize:12}} />
              </div>
            </div>
          </div>
        </div>
      );

    case "faq-accordion": {
      const items = (p.items as Array<{q:string;a:string}>)??[];
      return (
        <div style={{background:bg,padding:"42px 32px 56px"}}>
          <div style={{maxWidth:620,margin:"0 auto"}}>
            <h3 style={{textAlign:"center",color:"#fff",fontSize:22,fontWeight:700,marginBottom:22}}>Questions, answered</h3>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {items.map((it,idx)=>(
                <div key={idx} style={{background:"#101218",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"15px 18px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
                    <Editable tag="div" value={it.q} editable={ed} style={{color:"#e7ecf3",fontWeight:600,fontSize:15}}
                      onCommit={v=>onCommitItem(idx,"q",v)} onFocus={onFocus} />
                    <span style={{color:"#5b6678",flexShrink:0}}><Icon paths={["M6 9l6 6 6-6"]} size={18} /></span>
                  </div>
                  <Editable tag="p" value={it.a} editable={ed} style={{color:"#8b95a3",fontSize:13,lineHeight:1.6,marginTop:8}}
                    onCommit={v=>onCommitItem(idx,"a",v)} onFocus={onFocus} />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case "headline": {
      const sizeMap: Record<string,[number,number]> = { xl:[18,20], "2xl":[22,24], "3xl":[26,30], "4xl":[30,36], "5xl":[36,48] };
      const [sMob,sDesk] = sizeMap[(p.size as string)] ?? sizeMap["4xl"];
      return (
        <div style={{background:bg,padding:"16px 28px"}}>
          <E tag="h2" k="text" style={{fontSize:mob?sMob:sDesk,fontWeight:p.weight==="bold"?700:600,color:(p.color as string)??"#fff",textAlign:(p.align as React.CSSProperties["textAlign"])??"center",lineHeight:1.15,letterSpacing:"-0.01em",display:"block"}} />
        </div>
      );
    }

    case "body-text":
      return (
        <div style={{background:bg,padding:"10px 28px"}}>
          <E tag="p" k="text" style={{fontSize:16,lineHeight:1.7,color:(p.color as string)??"#9aa4b2",textAlign:(p.align as React.CSSProperties["textAlign"])??"left",maxWidth:680,margin:p.align==="center"?"0 auto":"0",display:"block"}} />
        </div>
      );

    case "list": {
      const items = (p.items as string[])??[];
      return (
        <div style={{background:bg,padding:"12px 28px"}}>
          <div style={{maxWidth:560,margin:"0 auto",display:"flex",flexDirection:"column",gap:11}}>
            {items.map((it,idx)=>(
              <div key={idx} style={{display:"flex",gap:11,alignItems:"flex-start"}}>
                <span style={{color:"#f97316",flexShrink:0,marginTop:1}}><Icon paths={["M5 12l4 4 10-10"]} size={18} sw={2.4} /></span>
                <Editable tag="span" value={it} editable={ed} style={{color:"#cbd2dc",fontSize:15,lineHeight:1.5}}
                  onCommit={v=>onCommitItem(idx,null,v)} onFocus={onFocus} />
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "cta-button":
      return (
        <div style={{background:bg,padding:"24px 28px",textAlign:"center"}}>
          <E tag="span" k="text" style={{display:"inline-flex",background:ac,color:"#fff",fontWeight:700,fontSize:16,padding:"15px 34px",borderRadius:11,boxShadow:`0 12px 28px -8px ${ac}88`}} />
        </div>
      );

    case "pricing-card": {
      const features = (p.features as string[])??[];
      return (
        <div style={{background:bg,padding:"48px 32px"}}>
          <div style={{maxWidth:380,margin:"0 auto",background:"#0c0c0f",border:"1px solid rgba(249,115,22,.4)",borderRadius:18,padding:"28px 26px",textAlign:"center",boxShadow:"0 0 0 4px rgba(249,115,22,.08)"}}>
            <E tag="div" k="title"    style={{color:"#e7ecf3",fontSize:15,fontWeight:600,marginBottom:8}} />
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:6,marginBottom:20}}>
              <E tag="span" k="price"  style={{color:"#fff",fontSize:38,fontWeight:800,letterSpacing:"-0.02em"}} />
              <E tag="span" k="period" style={{color:"#8b95a3",fontSize:13}} />
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:22,textAlign:"left"}}>
              {features.map((f,idx)=>(
                <div key={idx} style={{display:"flex",gap:9,alignItems:"center"}}>
                  <span style={{color:"#f97316"}}><Icon paths={["M5 12l4 4 10-10"]} size={16} sw={2.4} /></span>
                  <Editable tag="span" value={f} editable={ed} style={{color:"#cbd2dc",fontSize:13.5}}
                    onCommit={v=>onCommitItem(idx,null,v)} onFocus={onFocus} />
                </div>
              ))}
            </div>
            <E tag="div" k="cta_text" style={{background:"linear-gradient(180deg,#fb923c,#f97316)",color:"#fff",fontWeight:700,fontSize:15,padding:"13px",borderRadius:10}} />
          </div>
        </div>
      );
    }

    case "divider":
      return <div style={{background:bg,padding:"8px 28px"}}><div style={{height:1,background:"rgba(255,255,255,0.1)",maxWidth:680,margin:"0 auto"}} /></div>;

    case "spacer":
      return (
        <div style={{height:(p.height as number)??48,background:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {!preview && <span style={{color:"#3a4252",fontSize:10,letterSpacing:".1em",textTransform:"uppercase"}}>Spacer · {p.height as number}px</span>}
        </div>
      );

    case "section":
      return (
        <div style={{background:bg,padding:"40px 28px",border:preview?"none":"1px dashed rgba(255,255,255,0.08)",textAlign:"center"}}>
          <span style={{color:"#3a4252",fontSize:12}}>Empty section — drop blocks inside</span>
        </div>
      );

    case "two-column":
      return (
        <div style={{background:bg,padding:"28px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div style={{border:"1px dashed rgba(255,255,255,0.1)",borderRadius:10,padding:"20px 16px"}}>
            <E tag="p" k="left" style={{color:"#cbd2dc",fontSize:14,lineHeight:1.5,display:"block"}} />
          </div>
          <div style={{border:"1px dashed rgba(255,255,255,0.1)",borderRadius:10,padding:"20px 16px"}}>
            <E tag="p" k="right" style={{color:"#cbd2dc",fontSize:14,lineHeight:1.5,display:"block"}} />
          </div>
        </div>
      );

    case "image":
      return (
        <div style={{background:bg,padding:"8px 28px",textAlign:"center"}}>
          {p.src
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.src as string} alt={(p.alt as string)??""}  style={{maxWidth:"100%",borderRadius:10}} />
            : <div style={{border:"1px dashed rgba(255,255,255,0.1)",borderRadius:12,padding:"40px",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                <div style={{color:"#3a4252"}}><Icon paths={["M3 5h18v14H3z","M3 16l5-5 4 4 3-3 6 6"]} size={28} /></div>
                <span style={{color:"#3a4252",fontSize:12}}>Image — set URL in properties panel</span>
              </div>
          }
        </div>
      );

    case "custom-html":
      return <div style={{padding:"8px 28px"}} dangerouslySetInnerHTML={{__html:(p.html as string)??""}} />;

    default:
      return <div style={{padding:24,color:"#555",textAlign:"center"}}>{block.type}</div>;
  }
}

// ── Main Builder ───────────────────────────────────────────────────────────────

export default function BuilderPage() {
  const params    = useParams();
  const router    = useRouter();
  const funnelId  = params.id     as string;
  const pageId    = params.pageId as string;
  const AC = "#f97316";

  // Remote data
  const [page,       setPage]       = useState<PageData|null>(null);
  const [funnelName, setFunnelName] = useState("");
  const [funnelSlug, setFunnelSlug] = useState("");
  const [loading,    setLoading]    = useState(true);

  // Editor history state (blocks + undo/redo stacks)
  const [hist, dispatch] = useReducer(histReducer, { blocks:[], past:[], future:[] });
  const { blocks } = hist;

  // UI state
  const [selectedId,  setSelectedId]  = useState<string|null>(null);
  const [hoverId,     setHoverId]     = useState<string|null>(null);
  const [hoverInsert, setHoverInsert] = useState<number|null>(null);
  const [dragInsert,  setDragInsert]  = useState<number|null>(null);
  const [device,      setDevice]      = useState<Device>("desktop");
  const [zoom,        setZoom]        = useState(1);
  const [preview,     setPreview]     = useState(false);
  const [ab,          setAb]          = useState(false);
  const [leftTab,     setLeftTab]     = useState<"blocks"|"layers">("blocks");
  const [search,      setSearch]      = useState("");
  const [toast,       setToastMsg]    = useState<string|null>(null);
  const [saveStatus,  setSaveStatus]  = useState<"idle"|"saved">("idle");

  const dragCarrier = useRef<DragCarrier>(null);
  const toastTimer  = useRef<ReturnType<typeof setTimeout>|null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [pr, fr] = await Promise.all([
        fetch(`/api/admin/funnels/${funnelId}/pages/${pageId}`),
        fetch(`/api/admin/funnels/${funnelId}`),
      ]);
      const pd = await pr.json() as { page?: PageData };
      if (pd.page) {
        setPage(pd.page);
        dispatch({ type:"commit", next:(pd.page.blocks??[]) as Block[] });
      }
      if (fr.ok) {
        const fd = await fr.json() as { funnel?: { slug:string; name:string } };
        setFunnelSlug(fd.funnel?.slug??"");
        setFunnelName(fd.funnel?.name??"");
      }
      setLoading(false);
    }
    load();
  }, [funnelId, pageId]);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);

  // ── Block mutation helpers ─────────────────────────────────────────────────
  const commitBlocks = useCallback((next: Block[]) => dispatch({ type:"commit", next }), []);
  const setLive      = useCallback((next: Block[]) => dispatch({ type:"setLive", next }), []);

  function insertAt(idx: number, type: BlockType) {
    const nid = genId();
    const next = [...blocks];
    next.splice(idx, 0, { id:nid, type, props:defaultProps(type) });
    commitBlocks(next);
    setSelectedId(nid);
  }

  function addBlock(type: BlockType) {
    insertAt(blocks.length, type);
    showToast(`${LABELS[type]} added`);
  }

  function moveTo(id: string, idx: number) {
    const i = blocks.findIndex(b => b.id===id);
    if (i < 0) return;
    const next = [...blocks];
    const [x] = next.splice(i, 1);
    const j = i < idx ? idx-1 : idx;
    next.splice(j, 0, x);
    commitBlocks(next);
  }

  function moveBlock(id: string, dir: -1|1) {
    const i = blocks.findIndex(b=>b.id===id);
    const j = i+dir;
    if (j<0||j>=blocks.length) return;
    const next = [...blocks];
    const [x] = next.splice(i,1);
    next.splice(j,0,x);
    commitBlocks(next);
  }

  function duplicateBlock(id: string) {
    const nid = genId();
    const i = blocks.findIndex(b=>b.id===id);
    const next = [...blocks];
    next.splice(i+1, 0, { ...JSON.parse(JSON.stringify(blocks[i])), id:nid });
    commitBlocks(next);
    setSelectedId(nid);
    showToast("Block duplicated");
  }

  function removeBlock(id: string) {
    commitBlocks(blocks.filter(b=>b.id!==id));
    if (selectedId===id) setSelectedId(null);
  }

  // setProps = live update (no history push, for right-panel typing)
  function setProps(id: string, patch: Record<string, unknown>) {
    setLive(blocks.map(b => b.id===id ? {...b, props:{...b.props,...patch}} : b));
  }

  // commitProp = push to history (for inline edit onBlur)
  function commitProp(id: string, key: string, val: string) {
    commitBlocks(blocks.map(b => b.id===id ? {...b, props:{...b.props,[key]:val}} : b));
  }

  function commitItem(id: string, idx: number, field: string|null, val: string) {
    commitBlocks(blocks.map(b => {
      if (b.id!==id) return b;
      const items = [...(b.props.items as unknown[])];
      if (field===null) {
        items[idx] = val;
      } else {
        items[idx] = { ...(items[idx] as Record<string,unknown>), [field]:val };
      }
      return {...b, props:{...b.props,items}};
    }));
  }

  function addItem(id: string, item: unknown) {
    commitBlocks(blocks.map(b => b.id!==id ? b : {...b, props:{...b.props,items:[...(b.props.items as unknown[]),item]}}));
  }

  function removeItem(id: string, idx: number) {
    commitBlocks(blocks.map(b => b.id!==id ? b : {...b, props:{...b.props,items:(b.props.items as unknown[]).filter((_,j)=>j!==idx)}}));
  }

  // ── Page settings helpers ─────────────────────────────────────────────────
  function setPageField(patch: Partial<PageData>) {
    setPage(prev => prev ? {...prev,...patch} : prev);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save(silent=false) {
    if (!page) return;
    await fetch(`/api/admin/funnels/${funnelId}/pages/${pageId}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ blocks, name:page.name, slug:page.slug, settings:page.settings, connection:page.connection }),
    });
    if (!silent) { setSaveStatus("saved"); setTimeout(()=>setSaveStatus("idle"), 2500); }
  }

  async function publish() {
    if (!page) return;
    await save(true);
    await fetch(`/api/admin/funnels/${funnelId}/pages/${pageId}/publish`, { method:"POST" });
    setPage(prev => prev ? {...prev, status:"published"} : prev);
    showToast("Page published — live now");
  }

  // ── Drag helpers ──────────────────────────────────────────────────────────
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const idx = dragInsert;
    const d   = dragCarrier.current;
    if (d && idx!=null) {
      if (d.kind==="new") insertAt(idx, d.type);
      else moveTo(d.id, idx);
    }
    dragCarrier.current = null;
    setDragInsert(null);
  }

  // ── Device widths ─────────────────────────────────────────────────────────
  const deviceW = { desktop:980, tablet:800, mobile:390 }[device];

  if (loading) {
    return (
      <div style={{minHeight:"100vh",background:"#0a0e16",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{color:"rgba(255,255,255,0.2)",fontSize:14}}>Loading builder…</span>
      </div>
    );
  }
  if (!page) {
    return (
      <div style={{minHeight:"100vh",background:"#0a0e16",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{color:"rgba(255,255,255,0.2)",fontSize:14}}>Page not found</span>
      </div>
    );
  }

  const canUndo = hist.past.length > 1;
  const canRedo = hist.future.length > 0;
  const selectedBlock = blocks.find(b=>b.id===selectedId)??null;
  const isDraft = page.status !== "published";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",width:"100%",background:"#0a0e16",overflow:"hidden",fontFamily:"'Geist','Segoe UI',system-ui,sans-serif",color:"#e2e8f0"}}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header style={{height:53,flex:"0 0 auto",display:"flex",alignItems:"center",gap:12,padding:"0 12px",background:"#0b1019",borderBottom:"1px solid rgba(255,255,255,0.06)",zIndex:40,position:"relative"}}>

        {/* Left cluster */}
        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0,flex:"0 0 auto"}}>
          <button onClick={()=>router.push(`/admin/funnels/${funnelId}`)}
            style={{width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"rgba(255,255,255,0.05)",color:"#aeb6c2",borderRadius:8,cursor:"pointer"}}>
            <Icon paths={["M15 18l-6-6 6-6"]} size={17} sw={1.9} />
          </button>
          <div style={{width:1,height:24,background:"rgba(255,255,255,0.08)"}} />
          <div style={{display:"flex",flexDirection:"column",lineHeight:1.15,minWidth:0}}>
            <span style={{fontSize:10.5,color:"#5b6678",letterSpacing:".02em",whiteSpace:"nowrap"}}>{funnelName||"Funnel"}</span>
            <span style={{fontSize:13.5,fontWeight:600,color:"#eaeff6",whiteSpace:"nowrap"}}>{page.name}</span>
          </div>
          {/* Status pill */}
          <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10.5,fontWeight:600,padding:"3px 9px",borderRadius:999,letterSpacing:".03em",textTransform:"uppercase",background:isDraft?"rgba(245,158,11,.14)":"rgba(34,197,94,.14)",color:isDraft?"#fbbf24":"#4ade80",border:`1px solid ${isDraft?"rgba(245,158,11,.3)":"rgba(34,197,94,.3)"}`}}>
            <span style={{width:6,height:6,borderRadius:999,background:"currentColor"}} />
            {page.status}
          </span>
        </div>

        {/* Center cluster */}
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:10,minWidth:0}}>
          {/* Device segmented */}
          <div style={{display:"flex",background:"#0a0e16",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,padding:3,gap:2}}>
            {([["desktop",["M3 4h18v12H3z","M8 20h8","M12 16v4"]],["tablet",["M5 3h14v18H5z","M11 18h2"]],["mobile",["M7 3h10v18H7z","M11 18h2"]]] as const).map(([d,paths])=>(
              <button key={d} onClick={()=>setDevice(d as Device)} title={d}
                style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"5px 9px",border:"none",borderRadius:6,background:device===d?"rgba(255,255,255,0.1)":"transparent",color:device===d?"#eaeff6":"#6b7280",cursor:"pointer"}}>
                <Icon paths={paths as unknown as string[]} size={16} />
              </button>
            ))}
          </div>
          {/* Zoom */}
          <div style={{display:"flex",alignItems:"center",gap:2,background:"#0a0e16",border:"1px solid rgba(255,255,255,0.07)",borderRadius:9,padding:3}}>
            <button onClick={()=>setZoom(z=>Math.max(.5,Math.round((z-.1)*10)/10))} title="Zoom out"
              style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",color:"#9aa4b2",borderRadius:6,cursor:"pointer"}}>
              <Icon paths={["M5 12h14"]} size={15} sw={2} />
            </button>
            <button onClick={()=>setZoom(1)} title="Reset zoom"
              style={{minWidth:46,fontSize:12,fontWeight:500,color:"#cbd2dc",background:"transparent",border:"none",cursor:"pointer",fontFamily:"monospace"}}>
              {Math.round(zoom*100)}%
            </button>
            <button onClick={()=>setZoom(z=>Math.min(1.5,Math.round((z+.1)*10)/10))} title="Zoom in"
              style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",color:"#9aa4b2",borderRadius:6,cursor:"pointer"}}>
              <Icon paths={["M12 5v14","M5 12h14"]} size={15} sw={2} />
            </button>
          </div>
        </div>

        {/* Right cluster */}
        <div style={{display:"flex",alignItems:"center",gap:8,flex:"0 0 auto"}}>
          {/* Undo/redo */}
          <div style={{display:"flex",gap:4}}>
            {([[[canUndo,"undo"],["M9 14L4 9l5-5","M4 9h10a6 6 0 0 1 0 12h-3"]],[[canRedo,"redo"],["M15 14l5-5-5-5","M20 9H10a6 6 0 0 0 0 12h3"]]] as [[boolean,string],string[]][]).map(([[enabled,action],paths])=>(
              <button key={action} onClick={()=>dispatch({type:action as "undo"|"redo"})} disabled={!enabled} title={action}
                style={{width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"rgba(255,255,255,0.05)",color:enabled?"#cbd2dc":"#3a4252",borderRadius:8,cursor:enabled?"pointer":"default"}}>
                <Icon paths={paths} size={16} sw={2} />
              </button>
            ))}
          </div>
          {/* A/B toggle */}
          <button onClick={()=>setAb(x=>!x)} title="A/B test"
            style={{display:"inline-flex",alignItems:"center",gap:7,padding:"7px 12px",border:`1px solid ${ab?AC+"88":"rgba(255,255,255,0.08)"}`,background:ab?AC+"1f":"rgba(255,255,255,0.04)",color:ab?"#fcd9b6":"#aeb6c2",borderRadius:9,cursor:"pointer",fontSize:13,fontWeight:500,fontFamily:"inherit"}}>
            <Icon paths={["M4 4h7v16H4z","M13 4h7v16h-7z"]} size={15} sw={1.8} />A/B
          </button>
          {/* Preview toggle */}
          <button onClick={()=>{ setPreview(x=>!x); if(!preview) setSelectedId(null); }} title="Preview"
            style={{display:"inline-flex",alignItems:"center",gap:7,padding:"7px 12px",border:`1px solid ${preview?AC+"88":"rgba(255,255,255,0.08)"}`,background:preview?AC+"1f":"rgba(255,255,255,0.04)",color:preview?"#fcd9b6":"#aeb6c2",borderRadius:9,cursor:"pointer",fontSize:13,fontWeight:500,fontFamily:"inherit"}}>
            <Icon paths={preview?["M3 3l18 18","M10.6 10.6a2 2 0 0 0 2.8 2.8","M9.4 5.2A9 9 0 0 1 21 12a16 16 0 0 1-2.3 3.1","M6.6 6.6A16 16 0 0 0 3 12a9 9 0 0 0 12 6.7"]:["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z","M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"]} size={15} />
            {preview?"Exit":"Preview"}
          </button>
          {/* Saved indicator */}
          <div style={{display:"flex",alignItems:"center",gap:5,color:"#4b9e6a",fontSize:11.5,fontWeight:500,padding:"0 4px",opacity:saveStatus==="saved"?1:0,transition:"opacity .3s"}}>
            <Icon paths={["M5 12l4 4 10-10"]} size={14} sw={2.4} /> Saved
          </div>
          {/* Publish */}
          <button onClick={publish}
            style={{display:"inline-flex",alignItems:"center",gap:7,background:"linear-gradient(180deg,#fb923c,#f97316)",color:"#fff",fontWeight:600,fontSize:13,padding:"8px 16px",border:"none",borderRadius:9,cursor:"pointer",boxShadow:"0 6px 16px -6px rgba(249,115,22,.6),inset 0 1px 0 rgba(255,255,255,.25)"}}>
            <Icon paths={["M12 19V5","M5 12l7-7 7 7"]} size={15} sw={2} /> Publish
          </button>
        </div>
      </header>

      {/* ── A/B strip ────────────────────────────────────────────────────── */}
      {ab && (
        <div style={{flex:"0 0 auto",display:"flex",alignItems:"center",gap:14,padding:"9px 16px",background:"#0e1320",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:7,fontSize:12,fontWeight:600,color:"#fcd9b6"}}>
            <Icon paths={["M4 4h7v16H4z","M13 4h7v16h-7z"]} size={14} sw={1.8} /> A/B Test
          </span>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"5px 12px",background:`${AC}22`,border:`1px solid ${AC}66`,borderRadius:8}}>
              <span style={{fontSize:12,fontWeight:600,color:"#eaeff6"}}>Variant A</span>
              <span style={{fontSize:11,color:"#fcd9b6",fontFamily:"monospace"}}>50%</span>
            </div>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"5px 12px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8}}>
              <span style={{fontSize:12,fontWeight:600,color:"#9aa4b2"}}>Variant B</span>
              <span style={{fontSize:11,color:"#7c8aa0",fontFamily:"monospace"}}>50%</span>
            </div>
            <button onClick={()=>showToast("New variant created")}
              style={{display:"inline-flex",alignItems:"center",gap:5,padding:"6px 11px",background:"transparent",border:"1px dashed rgba(255,255,255,0.18)",borderRadius:8,color:"#9aa4b2",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
              <Icon paths={["M12 5v14","M5 12h14"]} size={13} sw={2.2} /> Add variant
            </button>
          </div>
          <div style={{flex:1}} />
          <span style={{fontSize:11.5,color:"#7c8aa0"}}>Split traffic evenly · 0 visitors so far</span>
          <button onClick={()=>showToast("Winner declared")}
            style={{padding:"6px 13px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,color:"#cbd2dc",fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}}>
            Declare winner
          </button>
        </div>
      )}

      {/* ── Three-panel body ─────────────────────────────────────────────── */}
      <div style={{flex:1,display:"flex",minHeight:0,position:"relative"}}>

        {/* LEFT PANEL */}
        {!preview && (
          <aside style={{width:270,flex:"0 0 270px",background:"#0b101a",borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",minHeight:0}}>
            {/* Tabs */}
            <div style={{display:"flex",padding:"0 8px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              {(["blocks","layers"] as const).map(tab=>(
                <button key={tab} onClick={()=>setLeftTab(tab)}
                  style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 0",background:"transparent",border:"none",borderBottom:`2px solid ${leftTab===tab?AC:"transparent"}`,color:leftTab===tab?"#eaeff6":"#6b7280",fontSize:12.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>
                  {tab}
                </button>
              ))}
            </div>

            {leftTab==="blocks" ? (
              <div style={{flex:1,overflow:"auto",padding:12}}>
                {/* Search */}
                <div style={{position:"relative",marginBottom:14}}>
                  <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"#5b6678",pointerEvents:"none"}}>
                    <Icon paths={["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z","M20 20l-3.5-3.5"]} size={15} />
                  </span>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search blocks"
                    style={{width:"100%",background:"#0a0e16",border:"1px solid rgba(255,255,255,0.08)",borderRadius:9,padding:"9px 10px 9px 34px",color:"#e7ecf3",fontSize:13,fontFamily:"inherit",outline:"none"}} />
                </div>
                {LIB_GROUPS.map(g=>{
                  const q=search.trim().toLowerCase();
                  const items=g.types.filter(t=>!q||LABELS[t].toLowerCase().includes(q));
                  if(!items.length) return null;
                  return (
                    <div key={g.group} style={{marginBottom:16}}>
                      <div style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:"#5b6678",marginBottom:9,paddingLeft:2}}>{g.group}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        {items.map(type=>(
                          <div key={type} draggable
                            onDragStart={()=>{ dragCarrier.current={kind:"new",type}; }}
                            onDragEnd={()=>{ dragCarrier.current=null; setDragInsert(null); }}
                            onClick={()=>addBlock(type)}
                            title="Click to add or drag to position"
                            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,padding:"13px 6px",background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,cursor:"grab",transition:"all .12s"}}
                            onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor=`${AC}99`;el.style.background=`${AC}14`;}}
                            onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor="rgba(255,255,255,0.06)";el.style.background="rgba(255,255,255,0.025)";}}>
                            <div style={{color:"#aeb6c2"}}><BlockIcon type={type} size={19} /></div>
                            <span style={{fontSize:11,color:"#9aa4b2",fontWeight:500,textAlign:"center",lineHeight:1.2}}>{LABELS[type]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{flex:1,overflow:"auto",padding:10}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:"#5b6678",margin:"4px 4px 10px"}}>Page structure</div>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  {blocks.map((b,i)=>{
                    const sel=selectedId===b.id;
                    return (
                      <div key={b.id} onClick={()=>setSelectedId(b.id)} draggable
                        onDragStart={()=>{ dragCarrier.current={kind:"move",id:b.id}; }}
                        style={{display:"flex",alignItems:"center",gap:9,padding:"8px 9px",borderRadius:8,cursor:"pointer",background:sel?`${AC}1f`:"transparent",border:`1px solid ${sel?`${AC}66`:"transparent"}`}}
                        onMouseEnter={e=>{if(!sel)(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.04)";}}
                        onMouseLeave={e=>{if(!sel)(e.currentTarget as HTMLElement).style.background="transparent";}}>
                        <span style={{color:sel?AC:"#6b7280",flexShrink:0}}><BlockIcon type={b.type} size={15} /></span>
                        <span style={{flex:1,fontSize:12.5,color:sel?"#eaeff6":"#9aa4b2",fontWeight:sel?600:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{LABELS[b.type]}</span>
                        <span style={{color:"#3a4252",fontSize:10,fontFamily:"monospace"}}>{i+1}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* CANVAS */}
        <div
          onClick={()=>setSelectedId(null)}
          onDragOver={e=>e.preventDefault()}
          onDrop={onDrop}
          onDragLeave={()=>setDragInsert(null)}
          style={{flex:"1 1 auto",minWidth:0,overflow:"auto",background:"radial-gradient(120% 80% at 50% 0,#11192b 0%,#0a0e16 55%)",position:"relative"}}
        >
          <div style={{minHeight:"100%",display:"flex",justifyContent:"center",alignItems:"flex-start",padding:preview?"0":"34px 34px 140px"}}>
            <div style={{width:preview?"100%":deviceW,maxWidth:preview?1100:"none",transform:`scale(${zoom})`,transformOrigin:"top center",transition:"width .28s ease"}}>
              <div
                onClick={e=>e.stopPropagation()}
                style={{background:"#0c0c0f",borderRadius:preview?0:device==="mobile"?30:device==="tablet"?20:14,overflow:"hidden",boxShadow:preview?"none":"0 40px 90px -28px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,0.07)",minHeight:400}}
              >
                {/* Insert zone before first block */}
                {!preview && (
                  <InsertZone idx={0} dragInsert={dragInsert} hoverInsert={hoverInsert}
                    onHover={()=>setHoverInsert(0)} onLeave={()=>setHoverInsert(h=>h===0?null:h)}
                    onDragOver={()=>setDragInsert(0)}
                    onClick={()=>insertAt(0,"body-text")} />
                )}

                {blocks.length === 0 && !preview && (
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:300,textAlign:"center",padding:32}}>
                    <div style={{width:48,height:48,borderRadius:12,background:"rgba(255,255,255,0.04)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12}}>
                      <Icon paths={["M12 4v16m8-8H4"]} size={22} />
                    </div>
                    <p style={{color:"rgba(255,255,255,0.2)",fontSize:14}}>Click a block on the left to add it</p>
                  </div>
                )}

                {blocks.map((b,i)=>{
                  const sel = selectedId===b.id;
                  const hov = hoverId===b.id && !sel;
                  return (
                    <React.Fragment key={b.id}>
                      <div
                        onMouseEnter={()=>setHoverId(b.id)}
                        onMouseLeave={()=>setHoverId(hv=>hv===b.id?null:hv)}
                        onClick={e=>{e.stopPropagation();setSelectedId(b.id);}}
                        onDragOver={e=>{e.preventDefault();const r=e.currentTarget.getBoundingClientRect();setDragInsert((e.clientY-r.top)<r.height/2?i:i+1);}}
                        style={{position:"relative",boxShadow:sel?`inset 0 0 0 2px ${AC}`:(hov?`inset 0 0 0 1px ${AC}66`:"none"),cursor:preview?"default":"pointer",transition:"box-shadow .12s"}}
                      >
                        <BlockContent block={b} device={device} preview={preview}
                          onCommitProp={(key,val)=>commitProp(b.id,key,val)}
                          onFocus={()=>setSelectedId(b.id)}
                          onCommitItem={(idx,field,val)=>commitItem(b.id,idx,field,val)}
                        />
                        {/* Selected block label */}
                        {sel && !preview && (
                          <div style={{position:"absolute",top:0,left:0,background:AC,color:"#fff",fontSize:9.5,fontWeight:600,padding:"2px 8px",borderBottomRightRadius:7,letterSpacing:".05em",textTransform:"uppercase",pointerEvents:"none",zIndex:15}}>
                            {LABELS[b.type]}
                          </div>
                        )}
                        {/* Floating block toolbar */}
                        {sel && !preview && (
                          <div onClick={e=>e.stopPropagation()}
                            style={{position:"absolute",top:-15,right:10,display:"flex",alignItems:"center",gap:1,background:"#161c28",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,padding:2,boxShadow:"0 8px 24px -6px rgba(0,0,0,.6)",zIndex:20}}>
                            {/* Drag handle */}
                            <div draggable onDragStart={()=>{ dragCarrier.current={kind:"move",id:b.id}; }} title="Drag to reorder"
                              style={{width:24,height:26,display:"flex",alignItems:"center",justifyContent:"center",color:"#5b6678",cursor:"grab"}}>
                              <Icon paths={["M9 6h.01","M9 12h.01","M9 18h.01","M15 6h.01","M15 12h.01","M15 18h.01"]} size={15} sw={2.6} />
                            </div>
                            {([
                              [["M12 19V5","M6 11l6-6 6 6"],()=>moveBlock(b.id,-1),"Move up"],
                              [["M12 5v14","M6 13l6 6 6-6"],()=>moveBlock(b.id,1),"Move down"],
                              [["M9 9h11v11H9z","M5 15V5h10"],()=>duplicateBlock(b.id),"Duplicate"],
                              [["M4 7h16","M6 7l1 13h10l1-13","M9 7V4h6v3"],()=>removeBlock(b.id),"Delete",true],
                            ] as [string[],()=>void,string,boolean?][]).map(([paths,fn,title,danger])=>(
                              <button key={title} onClick={e=>{e.stopPropagation();fn();}} title={title}
                                style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",color:danger?"#f87171":"#cbd2dc",borderRadius:6,cursor:"pointer"}}
                                onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.08)")}
                                onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                                <Icon paths={paths} size={15} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Insert zone after each block */}
                      {!preview && (
                        <InsertZone idx={i+1} dragInsert={dragInsert} hoverInsert={hoverInsert}
                          onHover={()=>setHoverInsert(i+1)} onLeave={()=>setHoverInsert(h=>h===i+1?null:h)}
                          onDragOver={()=>setDragInsert(i+1)}
                          onClick={()=>insertAt(i+1,"body-text")} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Preview exit button */}
          {preview && (
            <button onClick={()=>setPreview(false)}
              style={{position:"absolute",top:14,right:14,zIndex:50,display:"inline-flex",alignItems:"center",gap:7,padding:"9px 15px",background:"#161c28",border:"1px solid rgba(255,255,255,0.14)",color:"#eaeff6",borderRadius:10,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 10px 30px -8px rgba(0,0,0,.6)"}}>
              <Icon paths={["M6 6l12 12","M18 6L6 18"]} size={15} /> Exit preview
            </button>
          )}
        </div>

        {/* RIGHT PANEL */}
        {!preview && (
          <aside style={{width:304,flex:"0 0 304px",background:"#0b101a",borderLeft:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",minHeight:0}}>
            <RightPanel
              selectedBlock={selectedBlock}
              page={page}
              onDeselect={()=>setSelectedId(null)}
              onSetProps={setProps}
              onSetPage={setPageField}
              onCommitItem={commitItem}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onSave={()=>save()}
            />
          </aside>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{position:"absolute",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1a2230",border:"1px solid rgba(255,255,255,0.12)",color:"#eaeff6",fontSize:13,fontWeight:500,padding:"10px 18px",borderRadius:10,boxShadow:"0 16px 40px -10px rgba(0,0,0,.6)",zIndex:60,display:"flex",alignItems:"center",gap:9,whiteSpace:"nowrap"}}>
          <span style={{color:AC}}><Icon paths={["M5 12l4 4 10-10"]} size={15} sw={2.4} /></span>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Insert Zone component ─────────────────────────────────────────────────────

function InsertZone({ idx, dragInsert, hoverInsert, onHover, onLeave, onDragOver, onClick }:
  { idx:number; dragInsert:number|null; hoverInsert:number|null;
    onHover:()=>void; onLeave:()=>void; onDragOver:()=>void; onClick:()=>void }) {
  const active = dragInsert===idx;
  const hov    = hoverInsert===idx;
  const AC = "#f97316";
  return (
    <div
      onMouseEnter={onHover} onMouseLeave={onLeave}
      onDragOver={e=>{e.preventDefault();onDragOver();}}
      onClick={e=>{e.stopPropagation();onClick();}}
      style={{position:"relative",height:active?20:13,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",zIndex:5}}
    >
      {active && <div style={{position:"absolute",left:14,right:14,height:2.5,background:AC,borderRadius:3,boxShadow:`0 0 10px ${AC}`}} />}
      {(hov||active) && (
        <div style={{position:"absolute",width:22,height:22,borderRadius:999,background:AC,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 2px 10px ${AC}88`,zIndex:10}}>
          <Icon paths={["M12 5v14","M5 12h14"]} size={13} sw={2.6} />
        </div>
      )}
    </div>
  );
}

// ── Right Panel ───────────────────────────────────────────────────────────────

interface RPProps {
  selectedBlock: Block|null; page: PageData;
  onDeselect: ()=>void;
  onSetProps: (id:string, patch:Record<string,unknown>)=>void;
  onSetPage: (patch:Partial<PageData>)=>void;
  onCommitItem: (id:string, idx:number, field:string|null, val:string)=>void;
  onAddItem: (id:string, item:unknown)=>void;
  onRemoveItem: (id:string, idx:number)=>void;
  onSave: ()=>void;
}

function RightPanel({ selectedBlock:b, page, onDeselect, onSetProps, onSetPage, onCommitItem, onAddItem, onRemoveItem, onSave }: RPProps) {
  const AC = "#f97316";
  const IS: React.CSSProperties = { width:"100%",background:"#0a0e16",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,padding:"8px 10px",color:"#e7ecf3",fontSize:13,fontFamily:"inherit" };

  function Field({ label, children }: { label:string; children:React.ReactNode }) {
    return (
      <div style={{marginBottom:13}}>
        <label style={{display:"block",fontSize:11,color:"#7c8aa0",fontWeight:500,marginBottom:6}}>{label}</label>
        {children}
      </div>
    );
  }
  function SL({ text }: { text:string }) {
    return <div style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:"#5b6678",margin:"4px 0 12px",paddingBottom:8,borderBottom:"1px solid rgba(255,255,255,0.06)"}}>{text}</div>;
  }

  function textCtl(key:string) {
    if(!b) return null;
    return <input value={(b.props[key] as string)??""} onChange={e=>onSetProps(b.id,{[key]:e.target.value})} style={IS} />;
  }
  function areaCtl(key:string,rows=3) {
    if(!b) return null;
    return <textarea value={(b.props[key] as string)??""} onChange={e=>onSetProps(b.id,{[key]:e.target.value})} rows={rows} style={{...IS,resize:"vertical" as const,lineHeight:1.5}} />;
  }
  function colorCtl(key:string) {
    if(!b) return null;
    const v=(b.props[key] as string)??"#0c0c0f";
    const safe=v==="transparent"?"#0c0c0f":v;
    return (
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <div style={{position:"relative",width:34,height:34,borderRadius:8,overflow:"hidden",border:"1px solid rgba(255,255,255,0.12)",flexShrink:0,background:safe}}>
          <input type="color" value={safe} onChange={e=>onSetProps(b.id,{[key]:e.target.value})}
            style={{position:"absolute",inset:-4,width:42,height:42,border:"none",padding:0,cursor:"pointer",background:"transparent"}} />
        </div>
        <input value={v} onChange={e=>onSetProps(b.id,{[key]:e.target.value})} style={{...IS,fontFamily:"monospace",fontSize:12}} />
      </div>
    );
  }
  function alignCtl() {
    if(!b) return null;
    const cur=(b.props.align as string)??"left";
    const opts:[string,string[]][]=[["left",["M4 6h16","M4 12h10","M4 18h13"]],["center",["M4 6h16","M7 12h10","M5 18h14"]],["right",["M4 6h16","M10 12h10","M7 18h13"]]];
    return (
      <div style={{display:"flex",gap:4,background:"#0a0e16",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,padding:3}}>
        {opts.map(([a,paths])=>(
          <button key={a} onClick={()=>onSetProps(b.id,{align:a})}
            style={{flex:1,display:"flex",justifyContent:"center",padding:6,border:"none",borderRadius:6,background:cur===a?AC:"transparent",color:cur===a?"#fff":"#7c8aa0",cursor:"pointer"}}>
            <Icon paths={paths} size={16} />
          </button>
        ))}
      </div>
    );
  }
  function numCtl(key:string) {
    if(!b) return null;
    const val=(b.props[key] as number)??48;
    return (
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <input type="range" min={8} max={160} value={val} onChange={e=>onSetProps(b.id,{[key]:+e.target.value})} style={{flex:1,accentColor:AC}} />
        <span style={{fontSize:12,color:"#9aa4b2",fontFamily:"monospace",minWidth:46,textAlign:"right"}}>{val}px</span>
      </div>
    );
  }
  function segCtl(key:string, opts:[string,string][]) {
    if(!b) return null;
    const cur=(b.props[key] as string)??opts[0][0];
    return (
      <div style={{display:"flex",gap:4,background:"#0a0e16",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,padding:3}}>
        {opts.map(([v,l])=>(
          <button key={v} onClick={()=>onSetProps(b.id,{[key]:v})}
            style={{flex:1,padding:"6px 4px",border:"none",borderRadius:6,background:cur===v?AC:"transparent",color:cur===v?"#fff":"#7c8aa0",cursor:"pointer",fontSize:11.5,fontWeight:600,fontFamily:"inherit"}}>
            {l}
          </button>
        ))}
      </div>
    );
  }
  function toggleCtl(key:string) {
    if(!b) return null;
    const on=Boolean(b.props[key]);
    return (
      <button onClick={()=>onSetProps(b.id,{[key]:!on})}
        style={{display:"flex",alignItems:"center",gap:8,border:"none",background:"transparent",cursor:"pointer",padding:0,fontFamily:"inherit"}}>
        <span style={{width:34,height:19,borderRadius:999,background:on?AC:"#2a3142",position:"relative",transition:"background .15s",flexShrink:0}}>
          <span style={{position:"absolute",top:2,left:on?17:2,width:15,height:15,borderRadius:999,background:"#fff",transition:"left .15s"}} />
        </span>
        <span style={{fontSize:12.5,color:"#cbd2dc"}}>{on?"On":"Off"}</span>
      </button>
    );
  }
  function fieldsCtl() {
    if(!b) return null;
    const fields=(b.props.fields as Array<{type:string;label:string;required:boolean}>)??[];
    function update(idx:number, patch:Partial<{type:string;label:string;required:boolean}>) {
      const next=fields.map((f,i)=>i===idx?{...f,...patch}:f);
      onSetProps(b!.id,{fields:next});
    }
    function remove(idx:number) {
      onSetProps(b!.id,{fields:fields.filter((_,i)=>i!==idx)});
    }
    function add() {
      onSetProps(b!.id,{fields:[...fields,{type:`field_${fields.length+1}`,label:"New field",required:false}]});
    }
    return (
      <div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
          {fields.map((f,idx)=>(
            <div key={idx} style={{display:"flex",flexDirection:"column",gap:6,padding:"9px 10px",background:"#0a0e16",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8}}>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input value={f.label} onChange={e=>update(idx,{label:e.target.value})} placeholder="Label" style={{...IS,flex:1,padding:"6px 8px",fontSize:12}} />
                <button onClick={()=>remove(idx)} style={{border:"none",background:"transparent",color:"#5b6678",cursor:"pointer",padding:2,flexShrink:0}}>
                  <Icon paths={["M5 12h14"]} size={15} sw={2} />
                </button>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input value={f.type} onChange={e=>update(idx,{type:e.target.value})} placeholder="field_key" style={{...IS,flex:1,padding:"6px 8px",fontSize:11.5,fontFamily:"monospace"}} />
                <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#7c8aa0",whiteSpace:"nowrap"}}>
                  <input type="checkbox" checked={f.required} onChange={e=>update(idx,{required:e.target.checked})} />
                  Required
                </label>
              </div>
            </div>
          ))}
        </div>
        <button onClick={add}
          style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:8,background:`${AC}18`,border:`1px dashed ${AC}66`,borderRadius:8,color:AC,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          <Icon paths={["M12 5v14","M5 12h14"]} size={14} sw={2.4} /> Add field
        </button>
        <p style={{fontSize:10.5,color:"#5b6678",marginTop:8,lineHeight:1.4}}>
          Use &quot;email&quot; as the field key to render an email input. The key is used as the data field name on submission.
        </p>
      </div>
    );
  }
  function itemsCtl(kind:"stats"|"faq"|"list"|"pricing") {
    if(!b) return null;
    const items=(b.props.items as unknown[])??[];
    const blank=kind==="stats"?{value:"0",label:"Label"}:kind==="faq"?{q:"New question?",a:"Answer."}:"New item";
    return (
      <div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
          {items.map((it,idx)=>(
            <div key={idx} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",background:"#0a0e16",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8}}>
              <span style={{flex:1,fontSize:12,color:"#9aa4b2",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {kind==="stats"?`${(it as {value:string;label:string}).value} · ${(it as {value:string;label:string}).label}`:kind==="faq"?(it as {q:string}).q:(it as string)}
              </span>
              <button onClick={()=>onRemoveItem(b.id,idx)}
                style={{border:"none",background:"transparent",color:"#5b6678",cursor:"pointer",padding:2}}>
                <Icon paths={["M5 12h14"]} size={15} sw={2} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={()=>onAddItem(b.id,typeof blank==="string"?blank:{...blank as object})}
          style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:8,background:`${AC}18`,border:`1px dashed ${AC}66`,borderRadius:8,color:AC,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          <Icon paths={["M12 5v14","M5 12h14"]} size={14} sw={2.4} /> Add item
        </button>
        <p style={{fontSize:10.5,color:"#5b6678",marginTop:8,lineHeight:1.4}}>Edit item text directly on the canvas.</p>
      </div>
    );
  }

  function BlockSettings() {
    if(!b) return null;
    const t=b.type;
    const hasStyle=t==="headline"||t==="body-text"||t==="countdown-timer"||t==="cta-button"||b.props.bg_color!==undefined;
    const evergreen=Boolean(b.props.evergreen);
    return (
      <div>
        <SL text="Content" />
        {t==="hero"&&<><Field label="Eyebrow">{textCtl("eyebrow")}</Field><Field label="Headline">{textCtl("headline")}</Field><Field label="Sub-headline">{areaCtl("subtext")}</Field><Field label="Button label">{textCtl("cta_text")}</Field><Field label="Button URL">{textCtl("cta_url")}</Field></>}
        {t==="countdown-timer"&&<><Field label="Label">{textCtl("label")}</Field><Field label="Evergreen (per-visitor timer)">{toggleCtl("evergreen")}</Field>{evergreen?<Field label="Duration (minutes)">{numCtl("duration_minutes")}</Field>:<Field label="Target date & time"><input type="datetime-local" value={(b.props.target_date as string)??""} onChange={e=>onSetProps(b.id,{target_date:e.target.value})} style={IS} /></Field>}</>}
        {t==="video"&&<><Field label="Video URL (YouTube)">{textCtl("url")}</Field><Field label="Caption">{textCtl("caption")}</Field></>}
        {t==="optin-form"&&<><Field label="Title">{textCtl("title")}</Field><Field label="Form fields">{fieldsCtl()}</Field><Field label="Button label">{textCtl("button_text")}</Field><Field label="Fine print">{textCtl("fine_print")}</Field><Field label="Redirect URL after submit (optional)">{textCtl("redirect_url")}</Field></>}
        {t==="testimonial"&&<><Field label="Quote">{areaCtl("quote")}</Field><Field label="Author">{textCtl("author")}</Field><Field label="Role">{textCtl("role")}</Field></>}
        {(t==="headline"||t==="body-text")&&<Field label="Text">{areaCtl("text")}</Field>}
        {t==="cta-button"&&<><Field label="Button label">{textCtl("text")}</Field><Field label="Button URL">{textCtl("url")}</Field></>}
        {t==="pricing-card"&&<><Field label="Title">{textCtl("title")}</Field><Field label="Price">{textCtl("price")}</Field><Field label="Period">{textCtl("period")}</Field><Field label="Button label">{textCtl("cta_text")}</Field><Field label="Button URL">{textCtl("cta_url")}</Field><Field label="Features">{itemsCtl("pricing")}</Field></>}
        {t==="stats-bar"&&<Field label="Stats">{itemsCtl("stats")}</Field>}
        {t==="faq-accordion"&&<Field label="Questions">{itemsCtl("faq")}</Field>}
        {t==="list"&&<Field label="Items">{itemsCtl("list")}</Field>}
        {t==="spacer"&&<Field label="Height">{numCtl("height")}</Field>}
        {t==="image"&&<><Field label="Image URL">{textCtl("src")}</Field><Field label="Alt text">{textCtl("alt")}</Field></>}
        {t==="two-column"&&<><Field label="Left column text">{areaCtl("left")}</Field><Field label="Right column text">{areaCtl("right")}</Field></>}
        {t==="custom-html"&&<Field label="HTML"><textarea value={(b.props.html as string)??""}  onChange={e=>onSetProps(b.id,{html:e.target.value})} rows={6} style={{...IS,resize:"vertical" as const,fontFamily:"monospace"}} /></Field>}
        {["section","divider"].includes(t)&&<p style={{fontSize:12,color:"#7c8aa0",lineHeight:1.5,marginBottom:8}}>This block has no text content. Adjust its style below.</p>}
        {hasStyle&&(
          <>
            <div style={{height:18}} />
            <SL text="Style" />
            {t==="headline"&&<Field label="Size">{segCtl("size",[["2xl","S"],["3xl","M"],["4xl","L"],["5xl","XL"]])}</Field>}
            {(t==="headline"||t==="body-text")&&<><Field label="Alignment">{alignCtl()}</Field><Field label="Text color">{colorCtl("color")}</Field></>}
            {(t==="countdown-timer"||t==="cta-button")&&<Field label="Accent color">{colorCtl("accent_color")}</Field>}
            {b.props.bg_color!==undefined&&<Field label="Background">{colorCtl("bg_color")}</Field>}
          </>
        )}
      </div>
    );
  }

  function PageSettings() {
    const s=page.settings??{};
    const pInp=(val:string,onChange:(v:string)=>void)=>(
      <input value={val} onChange={e=>onChange(e.target.value)} style={IS} />
    );
    const bgVal=(s.bg_color as string)??"#0c0c0f";
    return (
      <div>
        <SL text="SEO & sharing" />
        <Field label="Page title">{pInp(page.name,v=>onSetPage({name:v}))}</Field>
        <Field label="Meta description">
          <textarea value={(s.description as string)??""} onChange={e=>onSetPage({settings:{...s,description:e.target.value}})} rows={3} style={{...IS,resize:"vertical" as const,lineHeight:1.5}} />
        </Field>
        <Field label="URL slug">
          <div style={{display:"flex",alignItems:"center"}}>
            <span style={{fontSize:12,color:"#5b6678",fontFamily:"monospace",background:"#080b12",border:"1px solid rgba(255,255,255,0.09)",borderRight:"none",borderRadius:"8px 0 0 8px",padding:"8px 8px"}}>/</span>
            <input value={page.slug} onChange={e=>onSetPage({slug:e.target.value})} style={{...IS,borderRadius:"0 8px 8px 0",fontFamily:"monospace",fontSize:12}} />
          </div>
        </Field>
        <div style={{height:18}} />
        <SL text="Style" />
        <Field label="Background color">
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{position:"relative",width:34,height:34,borderRadius:8,overflow:"hidden",border:"1px solid rgba(255,255,255,0.12)",flexShrink:0,background:bgVal}}>
              <input type="color" value={bgVal} onChange={e=>onSetPage({settings:{...s,bg_color:e.target.value}})}
                style={{position:"absolute",inset:-4,width:42,height:42,border:"none",padding:0,cursor:"pointer",background:"transparent"}} />
            </div>
            <input value={bgVal} onChange={e=>onSetPage({settings:{...s,bg_color:e.target.value}})} style={{...IS,fontFamily:"monospace",fontSize:12}} />
          </div>
        </Field>
        <div style={{height:18}} />
        <SL text="Tracking" />
        <Field label="Analytics / pixel ID">{pInp((s.tracking_id as string)??"",v=>onSetPage({settings:{...s,tracking_id:v}}))}</Field>
        <div style={{height:18}} />
        <button onClick={onSave}
          style={{width:"100%",padding:"9px",background:`${AC}1f`,border:`1px solid ${AC}44`,borderRadius:9,color:AC,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          Save page settings
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        {b ? (
          <>
            <div style={{width:30,height:30,borderRadius:8,background:`${AC}1f`,display:"flex",alignItems:"center",justifyContent:"center",color:AC,flexShrink:0}}>
              <BlockIcon type={b.type} size={16} />
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13.5,fontWeight:600,color:"#eaeff6"}}>{LABELS[b.type]}</div>
              <div style={{fontSize:10.5,color:"#5b6678"}}>Block settings</div>
            </div>
            <button onClick={onDeselect} style={{border:"none",background:"transparent",color:"#5b6678",cursor:"pointer",padding:4}}>
              <Icon paths={["M6 6l12 12","M18 6L6 18"]} size={16} />
            </button>
          </>
        ) : (
          <>
            <div style={{width:30,height:30,borderRadius:8,background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",color:"#aeb6c2",flexShrink:0}}>
              <Icon paths={["M4 5h16v14H4z","M4 9h16"]} size={16} sw={1.7} />
            </div>
            <div>
              <div style={{fontSize:13.5,fontWeight:600,color:"#eaeff6"}}>Page settings</div>
              <div style={{fontSize:10.5,color:"#5b6678"}}>Select a block to edit it</div>
            </div>
          </>
        )}
      </div>
      <div style={{flex:1,overflow:"auto",padding:"16px"}}>
        {b ? <BlockSettings /> : <PageSettings />}
      </div>
    </>
  );
}
