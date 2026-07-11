import React, { useState } from "react";
import { TAB_CLEARANCE } from "../lib/layout";
import { View, Text, FlatList, RefreshControl, Pressable, ScrollView, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import {
  getCrmThreads, getCrmUnmatched, getCrmWarmup,
  toggleCrmStar, promoteUnmatched, ignoreReply,
} from "../lib/api";
import type { CrmThread } from "../types/outreach";
import { R, FONT } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { Card, Chip, Skeleton, ErrorState, EmptyState, Avatar } from "../components/ui";
import { Icon } from "../components/Icon";
import type { InboxStackParams } from "../navigation/types";
import { timeAgo, leadName } from "../lib/format";

const TABS = [
  { key: "campaigns", label: "Campaigns" },
  { key: "unmatched", label: "Unmatched" },
  { key: "warmup",    label: "Warmup" },
] as const;

const STATUS_FILTERS = [
  ["all", "All"], ["interested", "Interested"], ["meeting_booked", "Meetings"],
  ["follow_up", "Follow up"], ["won", "Won"], ["not_interested", "Not interested"], ["neutral", "Neutral"],
] as const;

// ── Campaigns tab: real CRM threads ──────────────────────────────────────────
function ThreadsTab() {
  const { C, CRM_STATUS } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParams>>();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");

  const q = useInfiniteQuery({
    queryKey: ["crm-threads", status],
    queryFn: ({ pageParam }) => getCrmThreads(pageParam, status === "all" ? undefined : status),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.threads.length, 0);
      return loaded < last.total ? pages.length : undefined;
    },
  });

  const star = useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) => toggleCrmStar(id, starred),
    onMutate: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    onSettled: () => qc.invalidateQueries({ queryKey: ["crm-threads"] }),
  });

  const threads = q.data?.pages.flatMap(p => p.threads) ?? [];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 2, paddingBottom: 12, gap: 8, alignItems: "center" }}>
        {STATUS_FILTERS.map(([k, label]) => {
          const active = status === k;
          return (
            <Pressable key={k} onPress={() => setStatus(k)} style={{
              paddingHorizontal: 16, paddingVertical: 9, borderRadius: R.pill,
              borderWidth: 1, borderColor: active ? C.accent : C.border,
              backgroundColor: active ? C.accentSoft : "transparent",
            }}>
              <Text style={{ fontSize: 13, lineHeight: 18, fontFamily: FONT.semibold, color: active ? C.accent : C.textMuted }}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {q.isError && threads.length === 0 ? (
        <ErrorState message="Couldn't load your inbox" onRetry={q.refetch} />
      ) : q.isLoading ? (
        <View style={{ padding: 16, gap: 10 }}>{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={84} />)}</View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t: CrmThread) => t.enrollment_id}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 + TAB_CLEARANCE, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={q.refetch} tintColor={C.accent} />}
          onEndReached={() => { if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage(); }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState title="No conversations" hint="Replies from your campaigns land here." />}
          renderItem={({ item: t }) => {
            const name = leadName(t.lead);
            const tone = CRM_STATUS[t.crm_status] ?? CRM_STATUS.neutral;
            return (
              <Pressable
                onPress={() => navigation.navigate("Thread", { enrollmentId: t.enrollment_id })}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "flex-start", gap: 11,
                  paddingVertical: 11, paddingHorizontal: 8, borderRadius: R.md,
                  backgroundColor: pressed ? C.surface : "transparent",
                })}
              >
                <Avatar name={name} size={38} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, fontFamily: FONT.bold, color: C.text }}>{name}</Text>
                    <Text style={{ fontSize: 10.5, fontFamily: FONT.regular, color: C.textQuiet }}>
                      {t.latest_reply ? timeAgo(t.latest_reply.received_at) : t.replied_at ? timeAgo(t.replied_at) : ""}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textQuiet, marginBottom: 4 }}>
                    {[t.lead?.company, t.campaign?.name].filter(Boolean).join(" · ")}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 12.5, fontFamily: FONT.regular, color: C.textMuted, marginBottom: 6 }}>
                    {t.latest_reply?.body_text?.slice(0, 90) ?? ""}
                  </Text>
                  <Chip label={tone === CRM_STATUS.neutral ? "Neutral" : (CRM_STATUS[t.crm_status]?.label ?? t.crm_status)} color={tone.color} soft={tone.soft} />
                </View>
                <Pressable
                  onPress={() => star.mutate({ id: t.enrollment_id, starred: !t.is_starred })}
                  hitSlop={8}
                  style={{ padding: 4 }}
                >
                  <Icon name="star" size={17} color={t.is_starred ? C.warning : C.textFaint} fill={t.is_starred} />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

// ── Unmatched tab ─────────────────────────────────────────────────────────────
function UnmatchedTab() {
  const { C } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["crm-unmatched"], queryFn: () => getCrmUnmatched(1, 50) });

  const promote = useMutation({
    mutationFn: (replyId: string) => promoteUnmatched(replyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-unmatched"] });
      qc.invalidateQueries({ queryKey: ["crm-threads"] });
    },
    onError: (e) => Alert.alert("Couldn't promote", e instanceof Error ? e.message : "Try again"),
  });
  const ignore = useMutation({
    mutationFn: (replyId: string) => ignoreReply(replyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-unmatched"] }),
  });

  const rows = q.data?.data ?? [];

  if (q.isError && rows.length === 0) return <ErrorState message="Couldn't load unmatched replies" onRetry={q.refetch} />;
  if (q.isLoading) return <View style={{ padding: 16, gap: 10 }}>{[1, 2, 3].map(i => <Skeleton key={i} height={100} />)}</View>;

  return (
    <FlatList
      data={rows}
      keyExtractor={r => r.id}
      contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 16 + TAB_CLEARANCE, gap: 10, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={C.accent} />}
      ListEmptyComponent={<EmptyState title="No unmatched replies" hint="Replies that can't be matched to a campaign lead show up here." />}
      renderItem={({ item: r }) => (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, fontFamily: FONT.bold, color: C.text }}>
              {r.from_name || r.from_email}
            </Text>
            <Text style={{ fontSize: 10.5, fontFamily: FONT.regular, color: C.textQuiet }}>{timeAgo(r.received_at)}</Text>
          </View>
          <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textQuiet, marginBottom: 4 }}>
            {r.subject ?? "(no subject)"}{r.inbox ? ` → ${r.inbox.email_address}` : ""}
          </Text>
          <Text numberOfLines={2} style={{ fontSize: 12.5, fontFamily: FONT.regular, color: C.textMuted, marginBottom: 10 }}>
            {r.body_text?.slice(0, 140) ?? ""}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => promote.mutate(r.id)}
              disabled={promote.isPending}
              style={{ flex: 1, paddingVertical: 9, borderRadius: R.md, backgroundColor: C.accentSoft, alignItems: "center", opacity: promote.isPending ? 0.5 : 1 }}
            >
              <Text style={{ fontSize: 12.5, fontFamily: FONT.bold, color: C.accent }}>Promote to CRM</Text>
            </Pressable>
            <Pressable
              onPress={() => ignore.mutate(r.id)}
              disabled={ignore.isPending}
              style={{ flex: 1, paddingVertical: 9, borderRadius: R.md, backgroundColor: C.surfaceStrong, alignItems: "center", opacity: ignore.isPending ? 0.5 : 1 }}
            >
              <Text style={{ fontSize: 12.5, fontFamily: FONT.semibold, color: C.textMuted }}>Ignore</Text>
            </Pressable>
          </View>
        </Card>
      )}
    />
  );
}

// ── Warmup tab ────────────────────────────────────────────────────────────────
function WarmupTab() {
  const { C } = useTheme();
  const q = useQuery({ queryKey: ["crm-warmup"], queryFn: getCrmWarmup });
  const rows = q.data ?? [];

  if (q.isError && rows.length === 0) return <ErrorState message="Couldn't load warmup activity" onRetry={q.refetch} />;
  if (q.isLoading) return <View style={{ padding: 16, gap: 10 }}>{[1, 2, 3].map(i => <Skeleton key={i} height={72} />)}</View>;

  return (
    <FlatList
      data={rows}
      keyExtractor={r => r.id}
      contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 16 + TAB_CLEARANCE, gap: 8, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={C.accent} />}
      ListEmptyComponent={<EmptyState title="No warmup activity" hint="Warmup emails between your inboxes appear here." />}
      renderItem={({ item: r }) => (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 11, paddingHorizontal: 13, borderRadius: R.md }}>
          <View style={{ width: 30, height: 30, borderRadius: R.sm, backgroundColor: C.warningSoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name="flame" size={15} color={C.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: FONT.semibold, color: C.text }}>
              {r.subject ?? "(warmup email)"}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textQuiet, marginTop: 2 }}>
              {r.from_inbox?.email_address ?? "?"} → {r.to_inbox?.email_address ?? "?"}
              {r.replied_at ? " · replied" : ""}
            </Text>
          </View>
          <Text style={{ fontSize: 10.5, fontFamily: FONT.regular, color: C.textQuiet }}>{timeAgo(r.sent_at)}</Text>
        </Card>
      )}
    />
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function InboxScreen() {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("campaigns");

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12 }}>
        <Text style={{ fontSize: 22, fontFamily: FONT.bold, color: C.text, letterSpacing: -0.4 }}>Inbox</Text>
      </View>

      {/* Segmented control — Campaigns / Unmatched / Warmup, matching web */}
      <View style={{ flexDirection: "row", marginHorizontal: 16, marginBottom: 12, backgroundColor: C.surface, borderRadius: R.md, padding: 3 }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={{
              flex: 1, paddingVertical: 7, borderRadius: R.sm, alignItems: "center",
              backgroundColor: active ? C.surfaceStrong : "transparent",
            }}>
              <Text style={{ fontSize: 12.5, fontFamily: active ? FONT.bold : FONT.medium, color: active ? C.text : C.textQuiet }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "campaigns" ? <ThreadsTab /> : tab === "unmatched" ? <UnmatchedTab /> : <WarmupTab />}
    </View>
  );
}
