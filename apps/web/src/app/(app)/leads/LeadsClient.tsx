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

export default function LeadsClient() {
  const [lists, setLists]         = useState<OutreachList[]>([]);
  const [loading, setLoading]     = useState(true);
  const [newName, setNewName]     = useState("");
  const [creating, setCreating]   = useState(false);
  const [importing, setImporting] = useState<string | null>(null); // listId
  const [importMode, setImportMode] = useState<ImportMode>("csv");
  const [csvFile, setCsvFile]     = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping]     = useState<Partial<Record<string, string>>>({});
  const [customNames, setCustomNames] = useState<Record<string, string>>({}); // csv col → custom var name
  const [importResult, setImportResult] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Campaign import state
  const [campaigns, setCampaigns]           = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [validOnly, setValidOnly]           = useState(true);
  const [campaignImporting, setCampaignImporting] = useState(false);

  useEffect(() => { load(); }, []);

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
      // Auto-detect common column names
      const auto: Record<string, string> = {};
      for (const h of headers) {
        const lower = h.toLowerCase();
        if (lower.includes("email"))      auto[h] = "email";
        else if (lower.includes("first")) auto[h] = "first_name";
        else if (lower.includes("last"))  auto[h] = "last_name";
        else if (lower.includes("company") || lower.includes("org")) auto[h] = "company";
        else if (lower.includes("title") || lower.includes("role")) auto[h] = "title";
        else if (lower.includes("website") || lower.includes("url")) auto[h] = "website";
      }
      setMapping(auto);
    };
    reader.readAsText(file);
  }

  function handleMappingChange(col: string, value: string) {
    if (value === CUSTOM_SENTINEL) {
      setMapping((m) => ({ ...m, [col]: CUSTOM_SENTINEL }));
    } else {
      setMapping((m) => ({ ...m, [col]: value }));
      setCustomNames((n) => { const c = { ...n }; delete c[col]; return c; });
    }
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
    if (result.skipped_duplicate)   parts.push(`${result.skipped_duplicate} duplicates skipped.`);
    if (result.errors?.length)      parts.push(`${result.errors.length} error(s): ${result.errors.slice(0, 3).map(e => typeof e === "string" ? e : e.message).join(" | ")}`);
    setImportResult(parts.join(" "));
    setCsvFile(null); setCsvHeaders([]); setMapping({}); setCustomNames({}); setImporting(null);
    if (fileRef.current) fileRef.current.value = "";
    load();
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Lead Lists</h1>
          <p className="text-white/40 text-sm mt-0.5">Upload and manage contact lists for campaigns</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors">
          + New List
        </button>
      </div>

      {importResult && (
        <div className="mb-4 px-4 py-3 bg-green-500/15 border border-green-500/30 rounded-xl text-green-400 text-sm">{importResult}</div>
      )}

      {/* Create list form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 flex gap-3">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="List name (e.g. Real Estate Developers NYC)" className="flex-1 bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-blue-500/50" />
          <button type="submit" disabled={creating} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">Create</button>
          <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2.5 bg-white/6 hover:bg-white/10 text-white/60 rounded-xl text-sm">Cancel</button>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-16 bg-white/4 rounded-xl animate-pulse" />)}</div>
      ) : lists.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-medium">No lead lists yet</p>
          <p className="text-sm mt-1">Create a list and import a CSV to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lists.map((list) => (
            <div key={list.id}>
              <div className="bg-white/4 border border-white/8 rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <Link href={`/leads/${list.id}`} className="text-white font-medium text-sm hover:text-blue-300 transition-colors">{list.name}</Link>
                  {list.description && <p className="text-white/35 text-xs mt-0.5">{list.description}</p>}
                  <p className="text-white/30 text-xs mt-0.5">{(list.lead_count ?? 0).toLocaleString()} leads</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setImporting(importing === list.id ? null : list.id); setCsvFile(null); setCsvHeaders([]); }} className="px-3 py-1.5 bg-white/6 hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium rounded-lg transition-colors">Import CSV</button>
                  <Link href={`/leads/${list.id}`} className="px-3 py-1.5 bg-white/6 hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium rounded-lg transition-colors">View</Link>
                  <button onClick={() => handleDelete(list.id, list.name)} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium rounded-lg transition-colors">Delete</button>
                </div>
              </div>

              {/* CSV import panel */}
              {importing === list.id && (
                <div className="mt-2 bg-white/3 border border-white/8 rounded-xl p-5 space-y-4">
                  <p className="text-white/60 text-sm font-medium">Import CSV into "{list.name}"</p>
                  <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="text-sm text-white/50 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-white/10 file:text-white/70 file:cursor-pointer" />
                  {csvHeaders.length > 0 && (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-white/40 text-xs">Map CSV columns to contact fields:</p>
                        <p className="text-white/25 text-[10px]">Custom variables become <code className="bg-white/8 px-1 rounded">{`{{var_name}}`}</code> in emails</p>
                      </div>
                      <div className="space-y-2">
                        {csvHeaders.map((h) => {
                          const val = mapping[h] ?? "";
                          const isCustom = val === CUSTOM_SENTINEL || val.startsWith("custom:");
                          return (
                            <div key={h} className="flex items-center gap-2">
                              <span className="text-white/60 text-xs w-32 truncate flex-shrink-0" title={h}>{h}</span>
                              <span className="text-white/20 text-xs">→</span>
                              <select
                                value={isCustom ? CUSTOM_SENTINEL : val}
                                onChange={(e) => handleMappingChange(h, e.target.value)}
                                className="bg-white/6 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none min-w-0 flex-1"
                              >
                                <option value="">— skip —</option>
                                {DB_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                                <option value={CUSTOM_SENTINEL}>Custom variable…</option>
                              </select>
                              {isCustom && (
                                <input
                                  value={customNames[h] ?? ""}
                                  onChange={(e) => handleCustomName(h, e.target.value)}
                                  placeholder="var_name"
                                  className="bg-white/6 border border-white/10 rounded-lg px-2 py-1 text-xs text-white placeholder:text-white/20 focus:outline-none w-28 flex-shrink-0"
                                />
                              )}
                              {val && val !== CUSTOM_SENTINEL && (
                                <span className="text-white/25 text-[10px] flex-shrink-0">
                                  {val.startsWith("custom:") ? `{{${val.slice(7)}}}` : `{{${val}}}`}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <button onClick={() => handleImport(list.id)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors">Upload & Import</button>
                    </>
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
