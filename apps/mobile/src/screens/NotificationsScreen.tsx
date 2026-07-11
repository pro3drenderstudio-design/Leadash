import React, { useEffect } from "react";
import { View, Text, SectionList, RefreshControl, Pressable } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getNotifications, markNotificationsRead, MobileNotification } from "../lib/api";
import { C, R, FONT } from "../theme/tokens";
import { Card, Skeleton, ErrorState, EmptyState } from "../components/ui";
import { Icon, IconName } from "../components/Icon";
import type { HomeStackParams } from "../navigation/types";
import { useAppNav } from "../navigation/useAppNav";
import { timeAgo } from "../lib/format";

const KIND_ICON: Record<string, { icon: IconName; color: string; soft: string }> = {
  reply:     { icon: "mail",  color: C.success, soft: C.successSoft },
  milestone: { icon: "flame", color: C.info,    soft: C.infoSoft },
  health:    { icon: "warn",  color: C.warning, soft: C.warningSoft },
};

export default function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParams>>();
  const appNav = useAppNav();
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["notifications", 0], queryFn: () => getNotifications(0) });

  const markAll = useMutation({
    mutationFn: () => markNotificationsRead({ read_all: true }),
    onSettled:  () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Opening the screen marks everything read (feed badge clears)
  useEffect(() => {
    if ((q.data?.unread_count ?? 0) > 0) markAll.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.unread_count]);

  function open(n: MobileNotification) {
    if (n.data.enrollment_id) appNav.toThread(n.data.enrollment_id);
    else if (n.data.campaign_id) appNav.toCampaignDetail(n.data.campaign_id);
    else if (n.data.inbox_id) appNav.toInboxDetail(n.data.inbox_id);
  }

  const items = q.data?.notifications ?? [];
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const sections = [
    { title: "Today",   data: items.filter(n => new Date(n.created_at).getTime() >= dayAgo) },
    { title: "Earlier", data: items.filter(n => new Date(n.created_at).getTime() <  dayAgo) },
  ].filter(s => s.data.length > 0);

  if (q.isError && items.length === 0) {
    return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center" }}>
      <ErrorState message="Couldn't load notifications" onRetry={q.refetch} />
    </View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {q.isLoading ? (
        <View style={{ padding: 16, gap: 10 }}>{[1, 2, 3, 4].map(i => <Skeleton key={i} height={72} />)}</View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={n => n.id}
          contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={C.accent} />}
          ListEmptyComponent={<EmptyState title="Nothing yet" hint="Replies, milestones and inbox alerts will show up here." />}
          renderSectionHeader={({ section }) => (
            <Text style={{
              fontSize: 11, fontFamily: FONT.bold, letterSpacing: 0.8, textTransform: "uppercase",
              color: C.textQuiet, marginBottom: 4, marginTop: section.title === "Earlier" ? 8 : 0,
            }}>
              {section.title}
            </Text>
          )}
          renderItem={({ item: n }) => {
            const k = KIND_ICON[n.type] ?? KIND_ICON.reply;
            return (
              <Card onPress={() => open(n)} style={{
                flexDirection: "row", alignItems: "flex-start", gap: 11,
                paddingVertical: 12, borderRadius: R.md, marginBottom: 8,
                opacity: n.read_at ? 0.75 : 1,
              }}>
                <View style={{ width: 30, height: 30, borderRadius: R.sm, backgroundColor: k.soft, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={k.icon} size={15} color={k.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: C.text, marginBottom: 3 }}>{n.title}</Text>
                  {n.body ? <Text numberOfLines={2} style={{ fontSize: 12, fontFamily: FONT.regular, color: C.textMuted, lineHeight: 18 }}>{n.body}</Text> : null}
                </View>
                <Text style={{ fontSize: 10.5, fontFamily: FONT.regular, color: C.textQuiet }}>{timeAgo(n.created_at)}</Text>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
