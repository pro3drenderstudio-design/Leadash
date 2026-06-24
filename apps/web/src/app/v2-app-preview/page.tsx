"use client";

/**
 * /v2-app-preview — Storybook-style review surface for the v2-app kit.
 *
 * Visual inventory of every primitive in one scrollable page so we can
 * sign off on the design system before propagating it to real screens.
 * Routed in production so the team can review on staging, but tucked
 * under a path nobody will stumble onto.
 */

import * as React from "react";
import "../../v2-app/v2-app.css";
import {
  Button,
  Card,
  Badge,
  Skeleton,
  Tabs,
  Modal,
  Tooltip,
  EmptyState,
  ErrorState,
  DataTable,
  Field,
  Input,
  Textarea,
  Select,
  ToastProvider,
  useToast,
  Kbd,
  Icon,
  AppShell,
  Icons,
} from "@/v2-app";

const sampleRows = [
  { id: 1, name: "Maya Chen",   role: "Brand Designer",    company: "Lumen Studio",     status: "Replied",  fit: 96 },
  { id: 2, name: "Alex Rivera", role: "Strategy Lead",     company: "Soft Edges",       status: "Sent",     fit: 84 },
  { id: 3, name: "Priya Nair",  role: "Founder",           company: "Outbound Studio",  status: "Bounced",  fit: 72 },
  { id: 4, name: "Marcus Chen", role: "Independent",       company: "Self",             status: "Queued",   fit: 90 },
  { id: 5, name: "Lin Park",    role: "Senior Developer",  company: "Forge Group",      status: "Sent",     fit: 78 },
];

export default function V2AppPreviewPage() {
  return (
    <ToastProvider>
      <AppShell
        variant="app"
        brandTag="preview"
        onCommand={() => console.log("cmd-k")}
        onSignOut={() => console.log("sign-out")}
      >
        <PreviewContent />
      </AppShell>
    </ToastProvider>
  );
}

function PreviewContent() {
  const push = useToast();
  const [tab, setTab] = React.useState<"comfortable" | "compact">("comfortable");
  const [modalOpen, setModalOpen] = React.useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header>
        <p className="app-eyebrow" style={{ marginBottom: 8 }}>v2-app · foundation kit</p>
        <h1 className="app-h1">Primitives review</h1>
        <p style={{ color: "var(--app-text-muted)", marginTop: 4, maxWidth: 640 }}>
          Every component sat next to itself for sign-off. Once approved, A2 starts using these for auth + onboarding.
        </p>
      </header>

      {/* ── Buttons ────────────────────────────────────────────────────── */}
      <Section title="Buttons">
        <Row>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </Row>
        <Row>
          <Button size="sm" variant="primary">Small</Button>
          <Button variant="primary">Default</Button>
          <Button size="lg" variant="primary">Large</Button>
        </Row>
        <Row>
          <Button variant="primary" iconLeft={Icons.PlusSignIcon}>New campaign</Button>
          <Button variant="secondary" iconRight={Icons.ArrowRight01Icon}>Continue</Button>
          <Button variant="ghost" iconOnly={Icons.MoreHorizontalIcon} aria-label="More" />
          <Button variant="secondary" disabled>Disabled</Button>
        </Row>
      </Section>

      {/* ── Inputs ─────────────────────────────────────────────────────── */}
      <Section title="Inputs">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 720 }}>
          <Field label="Email" required helper="We'll send a magic link.">
            <Input type="email" placeholder="you@example.com" />
          </Field>
          <Field label="Company" helper="What's the workspace name?">
            <Input placeholder="Acme Co." />
          </Field>
          <Field label="Plan">
            <Select defaultValue="growth">
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="scale">Scale</option>
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea placeholder="Optional…" rows={3} />
          </Field>
          <Field label="API key" error="That key looks invalid.">
            <Input value="sk_live_••••_BAD" readOnly />
          </Field>
        </div>
      </Section>

      {/* ── Badges ─────────────────────────────────────────────────────── */}
      <Section title="Badges">
        <Row>
          <Badge>Default</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="success">Active</Badge>
          <Badge tone="warning">Pending</Badge>
          <Badge tone="danger">Failed</Badge>
          <Badge tone="info">Info</Badge>
        </Row>
      </Section>

      {/* ── Cards ──────────────────────────────────────────────────────── */}
      <Section title="Cards">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <Card>
            <h3 className="app-h3">Card</h3>
            <p style={{ color: "var(--app-text-muted)", fontSize: 13, marginTop: 4 }}>
              Default card padding (20px) for content blocks and form sections.
            </p>
          </Card>
          <Card tight interactive>
            <h3 className="app-h3">Tight + interactive</h3>
            <p style={{ color: "var(--app-text-muted)", fontSize: 13, marginTop: 4 }}>
              Hover me — border brightens.
            </p>
          </Card>
          <Card flat>
            <h3 className="app-h3">Flat</h3>
            <p style={{ color: "var(--app-text-muted)", fontSize: 13, marginTop: 4 }}>
              Outline only, no background. For nested groups.
            </p>
          </Card>
        </div>
      </Section>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <Section title="Tabs (also controls table density below)">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact",     label: "Compact" },
          ]}
        />
      </Section>

      {/* ── DataTable ──────────────────────────────────────────────────── */}
      <Section title={`DataTable — ${tab}`}>
        <DataTable
          density={tab}
          columns={[
            { key: "name",    header: "Name",    cell: r => <span style={{ color: "var(--app-text)" }}>{r.name}</span> },
            { key: "role",    header: "Role",    cell: r => r.role },
            { key: "company", header: "Company", cell: r => r.company },
            { key: "status",  header: "Status",  cell: r => (
              <Badge tone={r.status === "Replied" ? "success" : r.status === "Bounced" ? "danger" : r.status === "Queued" ? "warning" : "default"}>
                {r.status}
              </Badge>
            )},
            { key: "fit", header: "Fit", align: "right", cell: r => <span style={{ color: "var(--app-text)" }}>{r.fit}%</span> },
          ]}
          rows={sampleRows}
        />
      </Section>

      {/* ── Skeleton (loading state) ───────────────────────────────────── */}
      <Section title="Skeleton (loading state)">
        <DataTable
          loading
          density={tab}
          columns={[
            { key: "name",    header: "Name",    cell: () => null },
            { key: "role",    header: "Role",    cell: () => null },
            { key: "company", header: "Company", cell: () => null },
            { key: "status",  header: "Status",  cell: () => null },
            { key: "fit",     header: "Fit",     align: "right", cell: () => null },
          ]}
          rows={[]}
        />
      </Section>

      {/* ── Empty + Error states ───────────────────────────────────────── */}
      <Section title="Empty + Error states">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card flat style={{ padding: 0 }}>
            <EmptyState
              icon={Icons.Inbox01Icon}
              title="No campaigns yet"
              body="Create your first sequence to start landing replies."
              action={<Button variant="primary" iconLeft={Icons.PlusSignIcon}>New campaign</Button>}
            />
          </Card>
          <Card flat style={{ padding: 0 }}>
            <ErrorState
              title="We couldn't load that"
              body="The server didn't answer. Try again in a moment."
              action={<Button variant="secondary">Retry</Button>}
            />
          </Card>
        </div>
      </Section>

      {/* ── Modal + Tooltip + Toast triggers ───────────────────────────── */}
      <Section title="Modal, Tooltip, Toast">
        <Row>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>Open modal</Button>
          <Tooltip label="Free messaging window closes in 22 minutes">
            <Button variant="ghost" iconLeft={Icons.Clock01Icon}>Hover for tooltip</Button>
          </Tooltip>
          <Button variant="secondary" onClick={() => push("default", "Saved.")}>Toast (default)</Button>
          <Button variant="secondary" onClick={() => push("success", "Campaign published.")}>Toast (success)</Button>
          <Button variant="secondary" onClick={() => push("warning", "3 inboxes need warmup.")}>Toast (warning)</Button>
          <Button variant="secondary" onClick={() => push("danger",  "Failed to send.")}>Toast (danger)</Button>
        </Row>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Discard changes?"
        >
          <p style={{ color: "var(--app-text-muted)", fontSize: 13, lineHeight: 1.55 }}>
            You have unsaved edits to this sequence. Discard them to return to the last saved version, or cancel to keep editing.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <Button variant="ghost"   onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="danger"  onClick={() => setModalOpen(false)}>Discard</Button>
          </div>
        </Modal>
      </Section>

      {/* ── Icon set sample ────────────────────────────────────────────── */}
      <Section title="Hugeicons sample (16px @ 1.5)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10, color: "var(--app-text-muted)" }}>
          {[
            Icons.Dashboard01Icon, Icons.Mail01Icon, Icons.UserSearch01Icon, Icons.Wallet01Icon,
            Icons.GraduationScrollIcon, Icons.Inbox01Icon, Icons.Note01Icon, Icons.Briefcase01Icon,
            Icons.ChartBarLineIcon, Icons.Coins01Icon, Icons.Settings02Icon, Icons.HelpCircleIcon,
            Icons.SparklesIcon, Icons.PlusSignIcon, Icons.Search01Icon, Icons.FilterIcon,
            Icons.Edit02Icon, Icons.Delete02Icon, Icons.Copy01Icon, Icons.Download01Icon,
            Icons.CheckmarkCircle02Icon, Icons.AlertCircleIcon, Icons.InformationCircleIcon, Icons.Clock01Icon,
          ].map((ic, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 36, border: "1px solid var(--app-border)", borderRadius: 6 }}>
              <Icon icon={ic} size={18} />
            </div>
          ))}
        </div>
      </Section>

      {/* ── Keyboard / kbd ─────────────────────────────────────────────── */}
      <Section title="Keyboard hints">
        <Row>
          <span style={{ color: "var(--app-text-muted)", fontSize: 13 }}>
            Press <Kbd>⌘K</Kbd> to open search. <Kbd>g</Kbd> then <Kbd>d</Kbd> for dashboard. <Kbd>?</Kbd> for shortcuts.
          </span>
        </Row>
      </Section>

      <footer style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--app-border)", color: "var(--app-text-quiet)", fontSize: 12 }}>
        v2-app foundation — sign off here, then A2 starts on /login, /signup, /onboarding.
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 className="app-h3" style={{ color: "var(--app-text-quiet)", fontWeight: 500, letterSpacing: 0, fontSize: 12, textTransform: "uppercase", margin: 0 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>{children}</div>;
}
