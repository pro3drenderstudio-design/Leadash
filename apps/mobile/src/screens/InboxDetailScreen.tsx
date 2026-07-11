import React from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getInboxes, checkInboxDns } from "../lib/api";
import { C, R, FONT, INBOX_STATUS } from "../theme/tokens";
import { Card, Chip, Skeleton, ErrorState, ProgressBar, SectionLabel } from "../components/ui";
import { Icon } from "../components/Icon";
import { HealthRing, inboxHealthPct } from "./InboxesScreen";
import type { InboxesStackParams } from "../navigation/types";

type Props = NativeStackScreenProps<InboxesStackParams, "InboxDetail">;

export default function InboxDetailScreen({ route }: Props) {
  const { id } = route.params;

  // Inbox row comes from the list endpoint (no single-inbox GET needed)
  const inboxesQ = useQuery({ queryKey: ["inboxes"], queryFn: getInboxes });
  const inbox = inboxesQ.data?.find(i => i.id === id);

  // Live DNS probe — on-demand, takes a few seconds
  const dnsQ = useQuery({
    queryKey: ["dns-check", id],
    queryFn:  () => checkInboxDns(id),
    staleTime: 5 * 60 * 1000,
  });

  if (inboxesQ.isError && !inbox) {
    return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center" }}>
      <ErrorState message="Couldn't load inbox" onRetry={inboxesQ.refetch} />
    </View>;
  }

  if (!inbox) {
    return <View style={{ flex: 1, backgroundColor: C.bg, padding: 16, gap: 10 }}>
      <Skeleton height={80} /><Skeleton height={100} /><Skeleton height={220} />
    </View>;
  }

  const tone = INBOX_STATUS[inbox.status] ?? INBOX_STATUS.active;
  const warming = inbox.warmup_enabled && inbox.warmup_target_daily > 0 && inbox.warmup_current_daily < inbox.warmup_target_daily;
  const warmupPct = warming ? Math.round((inbox.warmup_current_daily / inbox.warmup_target_daily) * 100) : 100;
  const dns = dnsQ.data;

  const dnsRows: { label: string; pass: boolean; detail: string }[] = dns ? [
    { label: "SPF",   pass: dns.checks.spf.pass,   detail: dns.checks.spf.detail },
    { label: "DKIM",  pass: dns.checks.dkim.pass,  detail: dns.checks.dkim.detail },
    { label: "DMARC", pass: dns.checks.dmarc.pass, detail: dns.checks.dmarc.detail },
    { label: "MX",    pass: dns.checks.mx.pass,    detail: dns.checks.mx.detail },
  ] : [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
      refreshControl={<RefreshControl refreshing={dnsQ.isRefetching} onRefresh={() => { inboxesQ.refetch(); dnsQ.refetch(); }} tintColor={C.accent} />}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <HealthRing pct={inboxHealthPct(inbox)} size={66} stroke={7} color={tone.color} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: C.text }}>{inbox.email_address}</Text>
          <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: C.textQuiet, marginTop: 2 }}>
            {inbox.email_address.split("@")[1] ?? ""}
          </Text>
          <View style={{ marginTop: 6 }}>
            <Chip label={inbox.status} color={tone.color} soft={tone.soft} />
          </View>
        </View>
      </View>

      {inbox.last_error ? (
        <Card style={{ borderColor: C.danger, backgroundColor: C.dangerSoft }}>
          <Text style={{ fontSize: 12.5, fontFamily: FONT.medium, color: C.danger }}>{inbox.last_error}</Text>
        </Card>
      ) : null}

      {/* Warmup */}
      {warming && (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: C.textMuted }}>Warm-up progress</Text>
            <Text style={{ fontSize: 12.5, fontFamily: FONT.bold, color: C.text }}>{warmupPct}%</Text>
          </View>
          <ProgressBar pct={warmupPct} color={tone.color} height={7} />
          <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: C.textQuiet, marginTop: 6 }}>
            {inbox.warmup_current_daily}/{inbox.warmup_target_daily} daily · ramping {inbox.warmup_ramp_per_week}/week
          </Text>
        </Card>
      )}

      {/* Daily limit */}
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: C.textMuted }}>Daily sending limit</Text>
          <Text style={{ fontSize: 12.5, fontFamily: FONT.bold, color: C.text }}>{inbox.daily_send_limit}/day</Text>
        </View>
        <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: C.textQuiet }}>
          Send window {inbox.send_window_start}–{inbox.send_window_end}
        </Text>
      </Card>

      {/* DNS records */}
      <View>
        <SectionLabel>DNS records</SectionLabel>
        {dnsQ.isLoading ? (
          <View style={{ gap: 8 }}>{[1, 2, 3, 4].map(i => <Skeleton key={i} height={52} />)}</View>
        ) : dnsQ.isError || !dns ? (
          <ErrorState message="DNS check failed" onRetry={dnsQ.refetch} />
        ) : (
          <View style={{ gap: 8 }}>
            {dnsRows.map(row => (
              <Card key={row.label} style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 11, borderRadius: R.md }}>
                <View style={{
                  width: 26, height: 26, borderRadius: R.pill,
                  backgroundColor: row.pass ? C.successSoft : C.dangerSoft,
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Icon name={row.pass ? "check" : "warn"} size={13} color={row.pass ? C.success : C.danger} strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: FONT.semibold, color: C.text }}>{row.label}</Text>
                  <Text numberOfLines={2} style={{ fontSize: 11, fontFamily: FONT.regular, color: C.textQuiet, marginTop: 1 }}>{row.detail}</Text>
                </View>
                <Text style={{ fontSize: 11.5, fontFamily: FONT.bold, color: row.pass ? C.success : C.danger }}>
                  {row.pass ? "Pass" : "Failing"}
                </Text>
              </Card>
            ))}
            <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: C.textQuiet, textAlign: "right" }}>
              Score {dns.score}/{dns.max_score}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
