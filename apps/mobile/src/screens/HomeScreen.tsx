import React from "react";
import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getDashboard, getNotifications } from "../lib/api";
import { C, R, FONT } from "../theme/tokens";
import { Card, Skeleton, ErrorState, SectionLabel, Avatar } from "../components/ui";
import { Icon } from "../components/Icon";
import type { HomeStackParams } from "../navigation/types";
import { useAppNav } from "../navigation/useAppNav";
import { timeAgo } from "../lib/format";

function StatTile({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: "45%", paddingVertical: 13, paddingHorizontal: 14 }}>
      <Text style={{ fontSize: 22, fontFamily: FONT.bold, color: color ?? C.text }}>{value}</Text>
      <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textMuted, marginTop: 2 }}>{label}</Text>
    </Card>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParams>>();
  const appNav = useAppNav();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn:  getDashboard,
  });
  const { data: notifData } = useQuery({
    queryKey: ["notifications", 0],
    queryFn:  () => getNotifications(0),
  });

  const unread = notifData?.unread_count ?? 0;

  if (isError && !data) {
    return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center" }}>
      <ErrorState message="Couldn't load your dashboard" onRetry={refetch} />
    </View>;
  }

  const trend = data?.chartData.slice(-14) ?? [];
  const maxReplies = Math.max(1, ...trend.map(d => d.replies));
  const replyRate = data && data.sentThisMonth > 0
    ? Math.round((data.replies / data.sentThisMonth) * 1000) / 10
    : 0;

  const attention = [
    ...(data?.errorInboxes ?? []).map(i => ({
      key: `inbox-${i.id}`, label: i.email_address,
      detail: i.last_error ?? "Inbox error", tone: C.danger, soft: C.dangerSoft,
      onPress: () => appNav.toInboxDetail(i.id),
    })),
    ...(data?.pausedCampaigns ?? []).map(c => ({
      key: `campaign-${c.id}`, label: c.name,
      detail: "Campaign paused", tone: C.warning, soft: C.warningSoft,
      onPress: () => appNav.toCampaignDetail(c.id),
    })),
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.accent} />}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <View>
          <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: C.textQuiet }}>Welcome back</Text>
          <Text style={{ fontSize: 22, fontFamily: FONT.bold, color: C.text }}>
            Lead<Text style={{ color: C.accent }}>ash</Text>
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate("Notifications")}
          style={{ width: 36, height: 36, borderRadius: R.pill, backgroundColor: C.surfaceStrong, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="bell" size={17} color={C.text} />
          {unread > 0 && (
            <View style={{ position: "absolute", top: 4, right: 5, width: 8, height: 8, borderRadius: R.pill, backgroundColor: C.accent, borderWidth: 1.5, borderColor: C.elevated }} />
          )}
        </Pressable>
      </View>

      {isLoading && !data ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 10 }}><Skeleton height={72} style={{ flex: 1 }} /><Skeleton height={72} style={{ flex: 1 }} /></View>
          <View style={{ flexDirection: "row", gap: 10 }}><Skeleton height={72} style={{ flex: 1 }} /><Skeleton height={72} style={{ flex: 1 }} /></View>
          <Skeleton height={110} />
        </View>
      ) : data ? (
        <>
          {/* Stat tiles */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <StatTile value={String(data.activeCampaigns)} label="active campaigns" />
            <StatTile value={String(data.activeInboxes)} label="active inboxes"
              color={data.errorInboxes.length > 0 ? C.warning : C.success} />
            <StatTile value={data.sentThisMonth.toLocaleString()} label="sent this month" />
            <StatTile value={`${replyRate}%`} label="reply rate" color={C.accent} />
          </View>

          {/* 14-day reply trend */}
          <Card style={{ paddingVertical: 14, paddingHorizontal: 15 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{ fontSize: 12.5, fontFamily: FONT.bold, color: C.text }}>Replies — 14 days</Text>
              <Text style={{ fontSize: 11, fontFamily: FONT.bold, color: C.textMuted }}>{data.replies} this month</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 52 }}>
              {trend.length === 0 ? (
                <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: C.textQuiet }}>No activity yet</Text>
              ) : trend.map((d, i) => (
                <View key={i} style={{
                  flex: 1,
                  height: Math.max(3, (d.replies / maxReplies) * 48),
                  borderTopLeftRadius: 2, borderTopRightRadius: 2,
                  backgroundColor: i === trend.length - 1 ? C.accent : C.accentSoft,
                }} />
              ))}
            </View>
          </Card>

          {/* Needs attention */}
          {attention.length > 0 && (
            <View>
              <SectionLabel>Needs attention</SectionLabel>
              <View style={{ gap: 8 }}>
                {attention.map(a => (
                  <Card key={a.key} onPress={a.onPress} style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 11, paddingHorizontal: 13, borderRadius: R.md }}>
                    <View style={{ width: 30, height: 30, borderRadius: R.sm, backgroundColor: a.soft, alignItems: "center", justifyContent: "center" }}>
                      <Icon name="warn" size={15} color={a.tone} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: FONT.semibold, color: C.text }}>{a.label}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textMuted }}>{a.detail}</Text>
                    </View>
                    <Icon name="chevR" size={15} color={C.textQuiet} />
                  </Card>
                ))}
              </View>
            </View>
          )}

          {/* Recent replies */}
          <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <SectionLabel style={{ marginBottom: 0 }}>Recent replies</SectionLabel>
              <Pressable onPress={() => appNav.toInbox()}>
                <Text style={{ fontSize: 12, fontFamily: FONT.bold, color: C.accent }}>See all</Text>
              </Pressable>
            </View>
            {data.recentActivity.length === 0 ? (
              <Card><Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: C.textQuiet }}>No replies yet — they'll show up here as leads respond.</Text></Card>
            ) : (
              <View style={{ gap: 8 }}>
                {data.recentActivity.slice(0, 5).map(t => {
                  const name = t.latest_reply?.from_name
                    ?? [t.lead?.first_name, t.lead?.last_name].filter(Boolean).join(" ")
                    ?? t.lead?.email ?? "Unknown";
                  return (
                    <Card key={t.enrollment_id} onPress={() => appNav.toThread(t.enrollment_id)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 11, paddingHorizontal: 13, borderRadius: R.md }}>
                      <Avatar name={name} size={34} />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: FONT.bold, color: C.text }}>{name}</Text>
                        <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textMuted }}>
                          {t.latest_reply?.body_text?.slice(0, 80) ?? ""}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 10.5, fontFamily: FONT.regular, color: C.textQuiet }}>
                        {t.latest_reply ? timeAgo(t.latest_reply.received_at) : ""}
                      </Text>
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
