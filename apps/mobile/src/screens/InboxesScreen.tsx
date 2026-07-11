import React from "react";
import { TAB_CLEARANCE } from "../lib/layout";
import { View, Text, FlatList, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Svg, { Circle } from "react-native-svg";
import { getInboxes } from "../lib/api";
import { C, R, FONT, INBOX_STATUS } from "../theme/tokens";
import { Card, Chip, Skeleton, ErrorState, EmptyState, ProgressBar } from "../components/ui";
import type { InboxesStackParams } from "../navigation/types";
import type { OutreachInboxSafe } from "../types/outreach";

export function HealthRing({ pct, size = 46, stroke = 5, color }: {
  pct: number; size?: number; stroke?: number; color: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.surfaceStrong} strokeWidth={stroke} />
        <Circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(1, Math.max(0, pct)))}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={{ fontSize: 11, fontFamily: FONT.bold, color: C.text }}>{Math.round(pct * 100)}</Text>
    </View>
  );
}

/**
 * Simple health heuristic from what's actually stored: status is the primary
 * signal; warmup progress modulates it. (No stored health score exists.)
 */
export function inboxHealthPct(i: OutreachInboxSafe): number {
  if (i.status === "error")  return 0.2;
  if (i.status === "paused") return 0.5;
  if (i.warmup_enabled && i.warmup_target_daily > 0 && i.warmup_current_daily < i.warmup_target_daily) {
    return 0.6 + 0.4 * (i.warmup_current_daily / i.warmup_target_daily);
  }
  return 0.96;
}

export default function InboxesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<InboxesStackParams>>();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["inboxes"],
    queryFn:  getInboxes,
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12 }}>
        <Text style={{ fontSize: 22, fontFamily: FONT.bold, color: C.text, letterSpacing: -0.4 }}>Inboxes</Text>
      </View>

      {isError && !data ? (
        <ErrorState message="Couldn't load inboxes" onRetry={refetch} />
      ) : isLoading && !data ? (
        <View style={{ padding: 16, gap: 10 }}>{[1, 2, 3].map(i => <Skeleton key={i} height={76} />)}</View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 16 + TAB_CLEARANCE, gap: 10, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.accent} />}
          ListEmptyComponent={<EmptyState title="No inboxes connected" hint="Connect a sending inbox on leadash.com to get started." />}
          renderItem={({ item: i }) => {
            const tone = INBOX_STATUS[i.status] ?? INBOX_STATUS.active;
            const warming = i.warmup_enabled && i.warmup_target_daily > 0 && i.warmup_current_daily < i.warmup_target_daily;
            const warmupPct = warming ? Math.round((i.warmup_current_daily / i.warmup_target_daily) * 100) : 100;
            return (
              <Card
                onPress={() => navigation.navigate("InboxDetail", { id: i.id })}
                style={{ flexDirection: "row", alignItems: "center", gap: 13 }}
              >
                <HealthRing pct={inboxHealthPct(i)} color={tone.color} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13.5, fontFamily: FONT.bold, color: C.text }}>{i.email_address}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textQuiet, marginTop: 2, marginBottom: warming ? 6 : 0 }}>
                    Daily limit {i.daily_send_limit}{warming ? ` · warming ${warmupPct}%` : ""}
                  </Text>
                  {warming && <ProgressBar pct={warmupPct} color={tone.color} height={4} />}
                </View>
                <Chip label={i.status} color={tone.color} soft={tone.soft} />
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
