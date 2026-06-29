"use client";
import { useEffect, useState } from "react";
import { Block } from "../../types";

export function CountdownBlock({ block }: { block: Block }) {
  const p = block.props;
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    function calc() {
      let targetMs: number;
      if (p.evergreen) {
        const key = `ld_cd_${block.id}`;
        let stored = sessionStorage.getItem(key);
        if (!stored) {
          stored = String(Date.now() + ((p.duration_minutes as number) ?? 30) * 60_000);
          sessionStorage.setItem(key, stored);
        }
        targetMs = Number(stored);
      } else {
        targetMs = new Date((p.target_date as string) ?? "").getTime();
        if (Number.isNaN(targetMs)) targetMs = Date.now() + 30 * 60_000;
      }
      const diff = Math.max(0, targetMs - Date.now());
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setTimeLeft({ d, h, m, s });
    }
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [block.id, p]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const ac = (p.accent_color as string) ?? "#f97316";
  const bg = (p.bg_color as string) || "transparent";

  return (
    <div style={{ background:bg, padding:"13px 20px", display:"flex", alignItems:"center", justifyContent:"center", gap:16, flexWrap:"wrap", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
      <span style={{ color:"#aeb6c2", fontSize:13, fontWeight:500 }}>{(p.label as string) || "Enrollment closes in"}</span>
      <div style={{ display:"flex", gap:7 }}>
        {[[timeLeft.d,"Days"],[timeLeft.h,"Hrs"],[timeLeft.m,"Min"],[timeLeft.s,"Sec"]].map(([v,l]) => (
          <div key={l as string} style={{ textAlign:"center" }}>
            <div style={{ background:ac, color:"#fff", fontWeight:700, fontSize:17, borderRadius:7, padding:"5px 9px", minWidth:42, fontVariantNumeric:"tabular-nums" }}>{pad(v as number)}</div>
            <div style={{ color:"#6b7280", fontSize:8.5, marginTop:3, textTransform:"uppercase", letterSpacing:".08em" }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
