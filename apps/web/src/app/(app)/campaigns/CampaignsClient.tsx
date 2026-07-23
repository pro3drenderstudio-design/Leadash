"use client";

/**
 * /campaigns — restyled to v2-app.
 *
 * Behaviour preserved exactly:
 *   - getCampaigns / updateCampaign / deleteCampaign / cloneCampaign
 *   - tab switch between sequences and templates (?tab=templates)
 *   - search + status filter
 *   - clone error surfacing
 *   - draft → /campaigns/new?draft=<id>, non-draft → /campaigns/<id>
 *
 * Restyle highlights:
 *   - DataTable from v2-app, compact density (this is a power table)
 *   - Tabs use v2-app primitive
 *   - Status colour codes mapped to Badge tones
 *   - Paywall uses EmptyState pattern instead of a separate blurred-rows card
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { getCampaigns, updateCampaign, deleteCampaign, cloneCampaign, type ApiError } from "@/lib/outreach/api";
import UpgradeModal from "@/components/UpgradeModal";
import type { OutreachCampaign, CampaignStatus } from "@/types/outreach";
import {
  Button,
  Badge,
  Card,
  DataTable,
  EmptyState,
  Input,
  Tabs,
  Tooltip,
  Icon,
  type Column,
} from "@/v2-app";
import {
  PlusSignIcon,
  Search01Icon,
  Edit02Icon,
  Delete02Icon,
  Copy01Icon,
  Mail01Icon,
  Briefcase01Icon,
  Loading03Icon,
} from "@/v2-app/icons";
import "@/v2-app/v2-app.css";

const TemplatesClient = dynamic(() => import("@/app/(app)/templates/TemplatesClient"), { ssr: false });

type Tab = "sequences" | "templates";

const STATUS_TONE: Record<CampaignStatus, "default" | "success" | "warning" | "accent"> = {
  draft:     "default",
  active:    "success",
  paused:    "warning",
  completed: "accent",
};

const ALL_STATUSES: Array<CampaignStatus | "all"> = ["all", "active", "paused", "draft", "completed"];

function SequencesPaywall() {
  return (
    <Card style={{ padding: 0 }}>
      <EmptyState
        icon={Briefcase01Icon}
        title="Sequences are a paid feature"
        body="Upgrade your plan to create and run cold email sequences with advanced tracking and automation."
        action={
          <div style={{ display: "inline-flex", gap: 8 }}>
            <Link href="/settings?tab=billing" className="app-btn app-btn-primary">Upgrade plan</Link>
            <Link href="/settings?tab=billing" className="app-btn app-btn-secondary">View plans</Link>
          </div>
        }
      />
    </Card>
  );
}

export default function CampaignsClient({ canRunCampaigns = true }: { canRunCampaigns?: boolean }) {
  const params = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => (params.get("tab") === "templates" ? "templates" : "sequences"));
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [loading, setLoading]     = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all");
  const [cloning, setCloning]     = useState<string | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    setCampaigns(await getCampaigns());
    setLoading(false);
  }

  async function toggleStatus(c: OutreachCampaign) {
    const next = c.status === "active" ? "paused" : c.status === "paused" ? "active" : "active";
    try {
      await updateCampaign(c.id, { status: next as CampaignStatus });
      void load();
    } catch (e) {
      if ((e as ApiError)?.upgradeRequired) { setUpgradeOpen(true); return; }
      throw e;
    }
  }

  async function handleDelete(c: OutreachCampaign) {
    if (!confirm(`Delete campaign "${c.name}"? This cannot be undone.`)) return;
    await deleteCampaign(c.id);
    void load();
  }

  async function handleClone(c: OutreachCampaign) {
    setCloning(c.id);
    setCloneError(null);
    try {
      await cloneCampaign(c.id);
      await load();
    } catch {
      setCloneError(`Failed to clone "${c.name}". Please try again.`);
    } finally {
      setCloning(null);
    }
  }

  const filtered = campaigns.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const countByStatus = (s: CampaignStatus | "all") =>
    s === "all" ? campaigns.length : campaigns.filter(c => c.status === s).length;

  // Column definitions for the DataTable
  const columns: Column<OutreachCampaign>[] = [
    {
      key: "name",
      header: "Campaign",
      cell: c => {
        const enrolled = c.total_enrolled ?? 0;
        const replied  = c.total_replied  ?? 0;
        const progress = enrolled > 0 ? Math.round((replied / enrolled) * 100) : 0;
        const editHref = c.status === "draft" ? `/campaigns/new?draft=${c.id}` : `/campaigns/${c.id}`;
        return (
          <div style={{ minWidth: 0 }}>
            <Link href={editHref} style={{ color: "var(--app-text)", fontWeight: 500, textDecoration: "none" }}>
              {c.name}
            </Link>
            <div style={{ fontSize: 11, color: "var(--app-text-quiet)", marginTop: 2 }}>
              {c.send_days?.join(", ")} · {c.send_start_time}–{c.send_end_time}
            </div>
            {c.status === "active" && enrolled > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                <div style={{ flex: 1, height: 2, background: "var(--app-border)", borderRadius: 1, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: "var(--app-success)" }} />
                </div>
                <span style={{ fontSize: 10, color: "var(--app-text-quiet)", whiteSpace: "nowrap" }}>{progress}%</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: c => <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>,
      width: 110,
    },
    {
      key: "enrolled",
      header: "Enrolled",
      align: "right",
      width: 90,
      cell: c => (c.total_enrolled ?? 0).toLocaleString(),
    },
    {
      key: "sent",
      header: "Sent",
      align: "right",
      width: 80,
      cell: c => (c.total_sent ?? 0).toLocaleString(),
    },
    {
      key: "openRate",
      header: "Open rate",
      align: "right",
      width: 100,
      cell: c => {
        const sent   = c.total_sent ?? 0;
        const opened = c.total_opened ?? 0;
        const rate   = sent > 0 ? Math.round((opened / sent) * 100) : 0;
        const colour = rate >= 40
          ? "var(--app-success)"
          : rate >= 20
          ? "var(--app-warning)"
          : sent > 0
          ? "var(--app-text-muted)"
          : "var(--app-text-faint)";
        return <span style={{ color: colour }}>{sent > 0 ? `${rate}%` : "—"}</span>;
      },
    },
    {
      key: "replies",
      header: "Replies",
      align: "right",
      width: 90,
      cell: c => (c.total_replied ?? 0).toLocaleString(),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 132,
      cell: c => {
        const editHref = c.status === "draft" ? `/campaigns/new?draft=${c.id}` : `/campaigns/${c.id}`;
        return (
          <div style={{ display: "inline-flex", gap: 2, justifyContent: "flex-end" }}>
            {c.status !== "completed" && (
              <Tooltip label={c.status === "active" ? "Pause" : "Activate"}>
                <button
                  onClick={() => toggleStatus(c)}
                  className="app-btn app-btn-ghost app-btn-icon app-btn-sm"
                  aria-label={c.status === "active" ? "Pause" : "Activate"}
                >
                  {c.status === "active" ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  )}
                </button>
              </Tooltip>
            )}
            <Tooltip label={c.status === "draft" ? "Continue draft" : "Edit"}>
              <Link href={editHref} className="app-btn app-btn-ghost app-btn-icon app-btn-sm" aria-label="Edit">
                <Icon icon={Edit02Icon} size={13} />
              </Link>
            </Tooltip>
            <Tooltip label="Duplicate">
              <button
                onClick={() => handleClone(c)}
                disabled={cloning === c.id}
                className="app-btn app-btn-ghost app-btn-icon app-btn-sm"
                aria-label="Duplicate"
              >
                <Icon
                  icon={cloning === c.id ? Loading03Icon : Copy01Icon}
                  size={13}
                  className={cloning === c.id ? "app-spin" : undefined}
                />
              </button>
            </Tooltip>
            <Tooltip label="Delete">
              <button
                onClick={() => handleDelete(c)}
                className="app-btn app-btn-ghost app-btn-icon app-btn-sm"
                aria-label="Delete"
              >
                <Icon icon={Delete02Icon} size={13} />
              </button>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  return (
    <div className="v2-app" style={{ minHeight: "100%", background: "var(--app-bg)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 className="app-h1">Sequences</h1>
            <p style={{ color: "var(--app-text-muted)", fontSize: 13, marginTop: 4 }}>
              Create and manage cold email sequences.
            </p>
          </div>
          {activeTab === "sequences" && canRunCampaigns && (
            <Link href="/campaigns/new" className="app-btn app-btn-primary">
              <Icon icon={PlusSignIcon} size={14} />
              New sequence
            </Link>
          )}
        </header>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onChange={(v: Tab) => setActiveTab(v)}
          options={[
            { value: "sequences", label: "Sequences" },
            { value: "templates", label: "Templates" },
          ]}
        />

        {/* ── Templates tab ─────────────────────────────────────────────── */}
        {activeTab === "templates" && <TemplatesClient />}

        {/* ── Sequences paywall ─────────────────────────────────────────── */}
        {activeTab === "sequences" && !canRunCampaigns && <SequencesPaywall />}

        {/* ── Sequences body ────────────────────────────────────────────── */}
        {activeTab === "sequences" && canRunCampaigns && (
          <>
            {cloneError && (
              <div
                role="alert"
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: "var(--app-radius-sm)",
                  background: "var(--app-danger-soft)",
                  border: "1px solid rgba(248, 113, 113, 0.30)",
                  color: "var(--app-danger)", fontSize: 12,
                }}
              >
                <span>{cloneError}</span>
                <button
                  onClick={() => setCloneError(null)}
                  aria-label="Dismiss"
                  style={{ background: "transparent", border: "none", color: "currentColor", cursor: "pointer" }}
                >✕</button>
              </div>
            )}

            {/* Search + filters */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 360 }}>
                <span style={{
                  position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                  color: "var(--app-text-quiet)",
                  pointerEvents: "none",
                }}>
                  <Icon icon={Search01Icon} size={13} />
                </span>
                <Input
                  type="text"
                  placeholder="Search campaigns…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ paddingLeft: 30 }}
                />
              </div>
              <div className="app-tabs">
                {ALL_STATUSES.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className="app-tab"
                    data-active={statusFilter === s ? "true" : "false"}
                    style={{ textTransform: "capitalize" }}
                  >
                    {s === "all" ? "All" : s}
                    {s !== "all" && countByStatus(s) > 0 && (
                      <span style={{ color: "var(--app-text-quiet)", marginLeft: 4 }}>{countByStatus(s)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <DataTable
              density="compact"
              columns={columns}
              rows={filtered}
              loading={loading}
              emptyTitle={search || statusFilter !== "all" ? "No campaigns match those filters" : "No campaigns yet"}
              emptyBody={search || statusFilter !== "all"
                ? "Try clearing the filter or changing the search term."
                : "Create your first sequence to start landing replies."}
            />

            {!loading && filtered.length === 0 && !search && statusFilter === "all" && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: -16 }}>
                <Link href="/campaigns/new" className="app-btn app-btn-primary">
                  <Icon icon={Mail01Icon} size={14} />
                  Create your first sequence
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        .app-spin { animation: app-spin 0.8s linear infinite; }
        @keyframes app-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)}
        title="Pick a plan to activate" message="Your sequence is built and ready. Activating it to start sending needs a plan — pick one to launch." />
    </div>
  );
}
