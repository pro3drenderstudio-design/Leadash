"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { wsFetch } from "@/lib/workspace/client";

interface Icp {
  id: string;
  name: string;
  industry: string | null;
  geography: string | null;
  pains: string[];
  goals: string[];
  created_at: string;
}

interface OfferTemplate {
  id: string;
  name: string;
  price_label: string | null;
  value_prop: string | null;
  cta_kind: "book_call" | "reply" | "link";
  linked_checkout_offer_id: string | null;
  created_at: string;
}

const CTA_LABELS: Record<string, string> = { book_call: "Book a call", reply: "Ask for a reply", link: "Send a link" };

export default function PlaybookClient() {
  const router = useRouter();
  const [icps, setIcps] = useState<Icp[]>([]);
  const [offers, setOffers] = useState<OfferTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<"icp" | "offer" | null>(null);

  useEffect(() => {
    Promise.all([
      wsFetch("/api/playbook/icps").then((r: Response) => r.json() as Promise<{ icps?: Icp[] }>),
      wsFetch("/api/playbook/offer-templates").then((r: Response) => r.json() as Promise<{ offer_templates?: OfferTemplate[] }>),
    ])
      .then(([icpData, offerData]) => {
        setIcps(icpData.icps ?? []);
        setOffers(offerData.offer_templates ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function createIcp() {
    setCreating("icp");
    try {
      const res = await wsFetch("/api/playbook/icps", { method: "POST", body: JSON.stringify({ name: "New ICP" }) }).then((r: Response) => r.json() as Promise<{ icp?: { id: string } }>);
      if (res.icp) router.push(`/playbook/icps/${res.icp.id}`);
    } finally { setCreating(null); }
  }

  async function createOffer() {
    setCreating("offer");
    try {
      const res = await wsFetch("/api/playbook/offer-templates", { method: "POST", body: JSON.stringify({ name: "New Offer" }) }).then((r: Response) => r.json() as Promise<{ offer_template?: { id: string } }>);
      if (res.offer_template) router.push(`/playbook/offer-templates/${res.offer_template.id}`);
    } finally { setCreating(null); }
  }

  return (
    <div className="v2-app" style={{ color: "var(--app-text)", padding: "0 0 48px" }}>
      {/* Intro strip */}
      <div style={{
        padding: "20px 24px",
        background: "linear-gradient(135deg, rgba(167,139,250,0.08) 0%, rgba(249,115,22,0.06) 100%)",
        borderBottom: "1px solid var(--app-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>ICPs &amp; Offers</h1>
          <p style={{ fontSize: 13, color: "var(--app-text-muted)", lineHeight: 1.5 }}>
            Save your Ideal Customer Profile and offer details once — the AI uses them to write on-target sequences automatically.{" "}
            <button
              onClick={() => router.push("/campaigns/new")}
              style={{ color: "var(--app-accent)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 13 }}
            >
              Try the AI generator →
            </button>
          </p>
        </div>
      </div>

      <div style={{ padding: "28px 24px", display: "flex", flexDirection: "column", gap: 36 }}>

        {/* ICPs */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Ideal Customer Profiles</h2>
              <p style={{ fontSize: 12, color: "var(--app-text-muted)" }}>Who you&apos;re selling to — pains, goals, and objections</p>
            </div>
            <button
              onClick={createIcp}
              disabled={creating === "icp"}
              style={{
                background: "var(--app-accent)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                opacity: creating === "icp" ? 0.5 : 1,
              }}
            >
              {creating === "icp" ? "Creating…" : "+ New ICP"}
            </button>
          </div>

          {loading ? (
            <div style={{ height: 120, background: "var(--app-surface)", borderRadius: 12, border: "1px solid var(--app-border)" }} />
          ) : icps.length === 0 ? (
            <div style={{
              border: "1.5px dashed var(--app-border)",
              borderRadius: 12,
              padding: "40px 24px",
              textAlign: "center",
              color: "var(--app-text-muted)",
            }}>
              <p style={{ fontSize: 13, marginBottom: 12 }}>No ICPs yet. Create your first one to power the AI sequence generator.</p>
              <button
                onClick={createIcp}
                style={{ background: "var(--app-surface-strong)", color: "var(--app-text)", border: "1px solid var(--app-border)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                + Create ICP
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {icps.map(icp => (
                <button
                  key={icp.id}
                  onClick={() => router.push(`/playbook/icps/${icp.id}`)}
                  style={{
                    background: "var(--app-surface)",
                    border: "1px solid var(--app-border)",
                    borderRadius: 12,
                    padding: 18,
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "border-color 0.15s ease",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--app-accent)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--app-border)")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                      🎯
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--app-text)" }}>{icp.name}</div>
                      <div style={{ fontSize: 11, color: "var(--app-text-muted)" }}>
                        {[icp.industry, icp.geography].filter(Boolean).join(" · ") || "No industry set"}
                      </div>
                    </div>
                  </div>
                  {icp.pains.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {icp.pains.slice(0, 2).map((p, i) => (
                        <span key={i} style={{ fontSize: 11, background: "rgba(167,139,250,0.1)", color: "#A78BFA", padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(167,139,250,0.2)" }}>{p}</span>
                      ))}
                      {icp.pains.length > 2 && <span style={{ fontSize: 11, color: "var(--app-text-muted)" }}>+{icp.pains.length - 2}</span>}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Offer templates */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Offer Templates</h2>
              <p style={{ fontSize: 12, color: "var(--app-text-muted)" }}>What you&apos;re selling — value prop, proof, and CTA</p>
            </div>
            <button
              onClick={createOffer}
              disabled={creating === "offer"}
              style={{
                background: "var(--app-accent)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                opacity: creating === "offer" ? 0.5 : 1,
              }}
            >
              {creating === "offer" ? "Creating…" : "+ New Offer"}
            </button>
          </div>

          {loading ? (
            <div style={{ height: 120, background: "var(--app-surface)", borderRadius: 12, border: "1px solid var(--app-border)" }} />
          ) : offers.length === 0 ? (
            <div style={{
              border: "1.5px dashed var(--app-border)",
              borderRadius: 12,
              padding: "40px 24px",
              textAlign: "center",
              color: "var(--app-text-muted)",
            }}>
              <p style={{ fontSize: 13, marginBottom: 12 }}>No offer templates yet. Describe what you&apos;re selling once and the AI will use it in every sequence.</p>
              <button
                onClick={createOffer}
                style={{ background: "var(--app-surface-strong)", color: "var(--app-text)", border: "1px solid var(--app-border)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                + Create Offer
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {offers.map(offer => (
                <button
                  key={offer.id}
                  onClick={() => router.push(`/playbook/offer-templates/${offer.id}`)}
                  style={{
                    background: "var(--app-surface)",
                    border: "1px solid var(--app-border)",
                    borderRadius: 12,
                    padding: 18,
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "border-color 0.15s ease",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--app-accent)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--app-border)")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(249,115,22,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                      💼
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--app-text)" }}>{offer.name}</div>
                      {offer.price_label && <div style={{ fontSize: 11, color: "var(--app-accent)", fontWeight: 600 }}>{offer.price_label}</div>}
                    </div>
                  </div>
                  {offer.value_prop && (
                    <p style={{ fontSize: 12, color: "var(--app-text-muted)", lineHeight: 1.5, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {offer.value_prop}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, background: "rgba(249,115,22,0.1)", color: "var(--app-accent)", padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(249,115,22,0.2)" }}>
                      {CTA_LABELS[offer.cta_kind]}
                    </span>
                    {offer.linked_checkout_offer_id && (
                      <span style={{ fontSize: 11, color: "#34D399" }}>✓ Linked to checkout</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
