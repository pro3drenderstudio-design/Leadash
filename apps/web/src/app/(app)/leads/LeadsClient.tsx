"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getLists, createList, deleteList, importLeads } from "@/lib/outreach/api";
import { getWorkspaceId } from "@/lib/workspace/client";
import type { OutreachList, CsvFieldMapping } from "@/types/outreach";

interface Campaign {
  id: string;
  name: string;
  status: string;
  lead_count?: number;
  verified_count?: number;
}

type ImportMode = "csv" | "campaign";

const DB_FIELDS = ["email", "first_name", "last_name", "company", "title", "website"] as const;
const CUSTOM_SENTINEL = "__custom__";

function ListCard({
  list,
  isImporting,
  onImportToggle,
  onDelete,
}: {
  list: OutreachList;
  isImporting: boolean;
  onImportToggle: () => void;
  onDelete: () => void;
}) {
  const count = list.lead_count ?? 0;
  return (
    <div className="group bg-white/4 border border-white/8 hover:border-white/14 rounded-2xl transition-all overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          {/* Icon + name */}
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4.5 h-4.5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <Link
                href={`/leads/${list.id}`}
                className="text-white font-semibold text-sm hover:text-orange-300 transition-colors line-clamp-1"
              >
                {list.name}
              </Link>
              {list.description && (
                <p className="text-white/35 text-xs mt-0.5 line-clamp-1">{list.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mb-4">
          <div>
            <p className="text-2xl font-bold text-white tabular-nums">{count.toLocaleString()}</p>
            <p className="text-white/35 text-xs">leads</p>
          </div>
          {/* Progress bar visual if > 0 */}
          {count > 0 && (
            <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full"
                style={{ width: `${Math.min(100, (count / 10000) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onImportToggle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              isImporting
                ? "bg-orange-500/15 text-orange-400 border border-orange-500/25"
                : "bg-white/6 hover:bg-white/10 text-white/60 hover:text-white"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Import
          </button>
          <Link
            href={`/leads/${list.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/6 hover:bg-white/10 text-white/60 hover:text-white rounded-lg text-xs font-semibold transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            View
          </Link>
          <button
            onClick={onDelete}
            className="ml-auto p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Delete list"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LeadsClient({ poolUsed = 0, poolMax = 0 }: { poolUsed?: number; poolMax?: number }) {
  const [lists, setLists]           = useState<OutreachList[]>([]);
  const [loading, setLoading]       = useState(true);
  const [newName, setNewName]       = useState("");
  const [creating, setCreating]     = useState(false);
  const [importing, setImporting]   = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("csv");
  const [csvFile, setCsvFile]       = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping]       = useState<Partial<Record<string, string>>>({});
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [campaigns, setCampaigns]     = useState<Campaign[]>([]);
  const [campsLoading, setCampsLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [validOnly, setValidOnly]     = useState(true);
  const [campImporting, setCampImporting] = useState(false);

  useEffect(() => { load(); }, []);

  const totalLeads = lists.reduce((sum, l) => sum + (l.lead_count ?? 0), 0);

  async function loadCampaigns() {
    setCampsLoading(true);
    try {
      const wsId = getWorkspaceId() ?? "";
      const res = await fetch("/api/lead-campaigns", { headers: { "x-workspace-id": wsId } });
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : []);
    } catch { /* silent */ } finally { setCampsLoading(false); }
  }

  function openImport(listId: string) {
    setImporting(importing === listId ? null : listId);
    setImportMode("csv");
    setCsvFile(null); setCsvHeaders([]); setImportResult(null); setSelectedCampaignId("");
    if (campaigns.length === 0) loadCampaigns();
  }

  async function handleCampaignImport(listId: string) {
    if (!selectedCampaignId || !listId) return;
    setCampImporting(true);
    setImportResult(null);
    try {
      const wsId = getWorkspaceId() ?? "";
      const res = await fetch(`/api/lead-campaigns/${selectedCampaignId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
        body: JSON.stringify({ list_id: listId, valid_only: validOnly }),
      });
      const data = await res.json() as { exported?: number; skipped_duplicate?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Export failed");
      setImportResult({ ok: true, msg: `Added ${data.exported} leads (${data.skipped_duplicate ?? 0} duplicates skipped)` });
      setSelectedCampaignId(""); setImporting(null);
      load();
    } catch (err) {
      setImportResult({ ok: false, msg: `Error: ${err instanceof Error ? err.message : "Failed"}` });
    } finally { setCampImporting(false); }
  }

  async function load() {
    setLoading(true);
    setLists(await getLists());
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    await createList(newName.trim());
    setNewName(""); setShowCreate(false); setCreating(false);
    load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete list "${name}" and all its leads?`)) return;
    await deleteList(id); load();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const firstLine = (ev.target?.result as string).split("\n")[0] ?? "";
      const headers = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      setCsvHeaders(headers);
      const auto: Record<string, string> = {};
      for (const h of headers) {
        const lower = h.toLowerCase();
        if (lower.includes("email"))                             auto[h] = "email";
        else if (lower.includes("first"))                        auto[h] = "first_name";
        else if (lower.includes("last"))                         auto[h] = "last_name";
        else if (lower.includes("company") || lower.includes("org")) auto[h] = "company";
        else if (lower.includes("title") || lower.includes("role"))  auto[h] = "title";
        else if (lower.includes("website") || lower.includes("url")) auto[h] = "website";
      }
      setMapping(auto);
    };
    reader.readAsText(file);
  }

  function handleMappingChange(col: string, value: string) {
    if (value === CUSTOM_SENTINEL) setMapping((m) => ({ ...m, [col]: CUSTOM_SENTINEL }));
    else { setMapping((m) => ({ ...m, [col]: value })); setCustomNames((n) => { const c = { ...n }; delete c[col]; return c; }); }
  }

  function handleCustomName(col: string, name: string) {
    setCustomNames((n) => ({ ...n, [col]: name }));
    const key = name.trim().toLowerCase().replace(/\s+/g, "_");
    setMapping((m) => ({ ...m, [col]: key ? `custom:${key}` : CUSTOM_SENTINEL }));
  }

  async function handleImport(listId: string) {
    if (!csvFile) return;
    const fieldMapping: CsvFieldMapping[] = Object.entries(mapping)
      .filter(([, v]) => v && v !== CUSTOM_SENTINEL)
      .map(([csv_column, db_field]) => ({ csv_column, db_field: db_field as CsvFieldMapping["db_field"] }));
    setImportResult(null);
    const text = await csvFile.text();
    const lines = text.split("\n").filter(Boolean);
    const headers = lines[0]?.split(",").map((h) => h.trim().replace(/^"|"$/g, "")) ?? [];
    const rows: Record<string, string>[] = lines.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
    });
    const result = await importLeads(rows, listId, fieldMapping);
    const parts = [`Imported ${result.imported} leads.`];
    if (result.skipped_unsubscribed) parts.push(`${result.skipped_unsubscribed} unsubscribed skipped.`);
    if (result.skipped_duplicate)    parts.push(`${result.skipped_duplicate} duplicates skipped.`);
    setImportResult({ ok: true, msg: parts.join(" ") });
    setCsvFile(null); setCsvHeaders([]); setMapping({}); setCustomNames({}); setImporting(null);
    if (fileRef.current) fileRef.current.value = "";
    load();
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Leads Pool</h1>
          <p className="text-white/40 text-sm mt-1">
            Your contact lists for outreach sequences.
            {!loading && totalLeads > 0 && (
              <span className="ml-2 text-white/60 font-semibold">
                {totalLeads.toLocaleString()} total leads
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-semibold transition-colors flex-shrink-0 shadow-lg shadow-orange-500/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New List
        </button>
      </div>

      {/* Summary stats bar */}
      {!loading && lists.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Lists",  value: lists.length.toLocaleString(),        icon: "M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z", color: "text-violet-400" },
            { label: "Total Leads",  value: totalLeads.toLocaleString(),           icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", color: "text-orange-400" },
            { label: "Avg per List", value: lists.length > 0 ? Math.round(totalLeads / lists.length).toLocaleString() : "0", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zm0 0", color: "text-emerald-400" },
          ].map(s => (
            <div key={s.label} className="bg-white/4 border border-white/8 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                <svg className={`w-4 h-4 ${s.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                </svg>
              </div>
              <div>
                <p className={`text-lg font-bold ${s.color} tabular-nums`}>{s.value}</p>
                <p className="text-white/35 text-xs">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import result toast */}
      {importResult && (
        <div className={`mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-3 ${
          importResult.ok
            ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"
            : "bg-red-500/10 border border-red-500/25 text-red-400"
        }`}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={importResult.ok ? "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" : "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"} />
          </svg>
          {importResult.msg}
          <button onClick={() => setImportResult(null)} className="ml-auto text-current/60 hover:text-current transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Create list form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 bg-white/4 border border-white/10 rounded-2xl p-5">
          <p className="text-white font-semibold text-sm mb-3">Create a new list</p>
          <div className="flex gap-3">
            <input
              value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus
              placeholder="e.g. SaaS Founders NYC 2024"
              className="flex-1 bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-orange-500/50"
            />
            <button type="submit" disabled={creating || !newName.trim()} className="px-4 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
              {creating ? "Creating…" : "Create"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2.5 bg-white/6 hover:bg-white/10 text-white/60 rounded-xl text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Loading */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map((i) => <div key={i} className="h-40 bg-white/4 rounded-2xl animate-pulse" />)}
        </div>
      ) : lists.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-5">
            <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-white font-semibold text-lg mb-2">No lead lists yet</p>
          <p className="text-white/35 text-sm max-w-xs mb-6">
            Create your first list and import contacts via CSV or from a lead campaign.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-orange-500/20"
          >
            Create your first list
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((list) => (
            <div key={list.id} className="flex flex-col gap-3">
              <ListCard
                list={list}
                isImporting={importing === list.id}
                onImportToggle={() => openImport(list.id)}
                onDelete={() => handleDelete(list.id, list.name)}
              />

              {/* Import panel */}
              {importing === list.id && (
                <div className="bg-white/3 border border-white/10 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-white/70 text-sm font-semibold">Import leads</p>
                    <div className="flex gap-1 bg-white/6 rounded-lg p-0.5">
                      {([["csv", "CSV"], ["campaign", "Campaign"]] as const).map(([m, label]) => (
                        <button key={m} onClick={() => setImportMode(m)}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${importMode === m ? "bg-white/12 text-white" : "text-white/30 hover:text-white/60"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* CSV mode */}
                  {importMode === "csv" && (
                    <div className="space-y-3">
                      <div className="border-2 border-dashed border-white/10 rounded-xl p-4 text-center hover:border-orange-500/30 transition-colors">
                        <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" id={`csv-${list.id}`} />
                        <label htmlFor={`csv-${list.id}`} className="cursor-pointer">
                          {csvFile ? (
                            <div className="flex items-center gap-2 justify-center text-emerald-400 text-sm">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              {csvFile.name}
                            </div>
                          ) : (
                            <>
                              <svg className="w-6 h-6 text-white/25 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                              </svg>
                              <p className="text-white/40 text-xs">Click to choose CSV file</p>
                            </>
                          )}
                        </label>
                      </div>

                      {csvHeaders.length > 0 && (
                        <>
                          <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">Map columns</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {csvHeaders.map((h) => {
                              const val = mapping[h] ?? "";
                              const isCustom = val === CUSTOM_SENTINEL || val.startsWith("custom:");
                              return (
                                <div key={h} className="flex items-center gap-2">
                                  <span className="text-white/60 text-xs w-28 truncate flex-shrink-0 font-mono bg-white/5 px-2 py-1 rounded" title={h}>{h}</span>
                                  <svg className="w-3 h-3 text-white/20 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                                  <select value={isCustom ? CUSTOM_SENTINEL : val} onChange={(e) => handleMappingChange(h, e.target.value)}
                                    className="bg-white/6 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none min-w-0 flex-1">
                                    <option value="">— skip —</option>
                                    {DB_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                                    <option value={CUSTOM_SENTINEL}>Custom variable…</option>
                                  </select>
                                  {isCustom && (
                                    <input value={customNames[h] ?? ""} onChange={(e) => handleCustomName(h, e.target.value)}
                                      placeholder="var_name"
                                      className="bg-white/6 border border-white/10 rounded-lg px-2 py-1 text-xs text-white placeholder:text-white/20 focus:outline-none w-24 flex-shrink-0" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <button onClick={() => handleImport(list.id)}
                            className="w-full py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-semibold transition-colors">
                            Upload & Import
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Campaign mode */}
                  {importMode === "campaign" && (
                    <div className="space-y-3">
                      {campsLoading ? (
                        <p className="text-white/30 text-xs">Loading campaigns…</p>
                      ) : campaigns.length === 0 ? (
                        <p className="text-white/30 text-xs">No campaigns found. <Link href="/lead-campaigns" className="text-orange-400 underline">Create one first.</Link></p>
                      ) : (
                        <select value={selectedCampaignId} onChange={e => setSelectedCampaignId(e.target.value)}
                          className="w-full bg-white/6 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/50">
                          <option value="">— Choose a campaign —</option>
                          {campaigns.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.lead_count ? ` (${c.lead_count} leads)` : ""}
                            </option>
                          ))}
                        </select>
                      )}

                      <label className="flex items-center gap-3 cursor-pointer">
                        <div onClick={() => setValidOnly(v => !v)}
                          className={`w-9 h-5 rounded-full transition-colors cursor-pointer flex items-center px-0.5 flex-shrink-0 ${validOnly ? "bg-orange-500" : "bg-white/15"}`}>
                          <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${validOnly ? "translate-x-4" : "translate-x-0"}`} />
                        </div>
                        <span className="text-white/60 text-xs">Valid emails only (recommended)</span>
                      </label>

                      <button
                        onClick={() => handleCampaignImport(list.id)}
                        disabled={!selectedCampaignId || campImporting}
                        className="w-full py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors"
                      >
                        {campImporting ? "Adding leads…" : "Add to this list"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
