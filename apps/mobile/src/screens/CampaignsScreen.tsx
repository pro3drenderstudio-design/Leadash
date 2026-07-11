import React, { useState } from "react";
import { TAB_CLEARANCE } from "../lib/layout";
import { View, Text, FlatList, RefreshControl, Pressable, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getCampaigns } from "../lib/api";
import { R, FONT } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { Card, Chip, Skeleton, ErrorState, EmptyState, ProgressBar } from "../components/ui";
import type { CampaignsStackParams } from "../navigation/types";

const FILTERS = ["all", "active", "paused", "draft", "completed"] as const;

export default function CampaignsScreen() {
  const { C, CAMPAIGN_STATUS } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<CampaignsStackParams>>();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["campaigns"],
    queryFn:  getCampaigns,
  });

  const filtered = (data ?? []).filter(c => filter === "all" || c.status === filter);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12 }}>
        <Text style={{ fontSize: 22, fontFamily: FONT.bold, color: C.text, letterSpacing: -0.4 }}>Campaigns</Text>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 7 }}>
        {FILTERS.map(f => {
          const active = filter === f;
          return (
            <Pressable key={f} onPress={() => setFilter(f)} style={{
              paddingHorizontal: 13, paddingVertical: 6, borderRadius: R.pill,
              borderWidth: 1, borderColor: active ? C.accent : C.border,
              backgroundColor: active ? C.accentSoft : "transparent",
            }}>
              <Text style={{ fontSize: 12.5, lineHeight: 17, fontFamily: FONT.semibold, color: active ? C.accent : C.textMuted, textTransform: "capitalize" }}>{f}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isError && !data ? (
        <ErrorState message="Couldn't load campaigns" onRetry={refetch} />
      ) : isLoading && !data ? (
        <View style={{ padding: 16, gap: 10 }}>{[1, 2, 3, 4].map(i => <Skeleton key={i} height={100} />)}</View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 16 + TAB_CLEARANCE, gap: 10, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.accent} />}
          ListEmptyComponent={
            <EmptyState
              title={filter === "all" ? "No campaigns yet" : `No ${filter} campaigns`}
              hint={filter === "all" ? "Create your first campaign on leadash.com" : undefined}
            />
          }
          renderItem={({ item: c }) => {
            const tone = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.draft;
            const enrolled = c.total_enrolled ?? 0;
            const replied  = c.total_replied ?? 0;
            const pct = enrolled > 0 ? Math.round((replied / enrolled) * 100) : 0;
            return (
              <Card onPress={() => navigation.navigate("CampaignDetail", { id: c.id })}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 9 }}>
                  <Text style={{ flex: 1, fontSize: 14.5, fontFamily: FONT.bold, color: C.text, lineHeight: 19 }}>{c.name}</Text>
                  <Chip label={c.status} color={tone.color} soft={tone.soft} />
                </View>
                <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textQuiet, marginBottom: 10 }}>
                  {(c.send_days ?? []).join(", ") || "Any day"} · {c.send_start_time}–{c.send_end_time}
                </Text>
                {enrolled > 0 ? (
                  <View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                      <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textMuted }}>{enrolled} enrolled</Text>
                      <Text style={{ fontSize: 11.5, fontFamily: FONT.bold, color: C.text }}>{pct}% replied</Text>
                    </View>
                    <ProgressBar pct={pct} />
                  </View>
                ) : (
                  <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, fontStyle: "italic", color: C.textQuiet }}>Not started yet</Text>
                )}
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
