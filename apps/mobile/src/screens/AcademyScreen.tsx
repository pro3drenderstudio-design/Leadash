/**
 * Academy home — "Continue learning" (enrolled items with progress rings)
 * plus "Browse everything" with All/Courses/Challenges filters.
 * Ported from the design prototype's scrAcademy.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { TAB_CLEARANCE } from "../lib/layout";
import { getAcademyProducts } from "../lib/api";
import { R, FONT } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "../components/Icon";
import { Card, Chip, Skeleton, ErrorState, EmptyState, Ring, SectionLabel } from "../components/ui";
import type { AcademyStackParams } from "../navigation/types";
import type { AcademyProductRow } from "../types/academy";

const FILTERS = [["all", "All"], ["course", "Courses"], ["challenge", "Challenges"]] as const;

/** Deterministic per-product accent, mirroring the design's varied card colors. */
export function productColor(p: AcademyProductRow, accent: string): string {
  if (p.product_type === "challenge") return accent;
  const palette = ["#60A5FA", "#A78BFA", "#34D399", "#22D3EE", "#FBBF24"];
  let hash = 0;
  for (const ch of p.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

/** Current challenge day from enrollment date (1-based, capped at duration). */
export function challengeDay(p: AcademyProductRow): { day: number; total: number } {
  const total = p.challenge_config?.duration_days ?? 30;
  if (!p.enrollment) return { day: 0, total };
  const start = p.challenge_config?.start_mode === "cohort" && p.cohort?.starts_at
    ? new Date(p.cohort.starts_at) : new Date(p.enrollment.enrolled_at);
  const day = Math.floor((Date.now() - start.getTime()) / 86_400_000) + 1;
  return { day: Math.min(Math.max(day, 1), total), total };
}

function productTag(p: AcademyProductRow): { label: string; challenge: boolean } | null {
  if (p.product_type === "challenge") return { label: "Live cohort", challenge: true };
  if (p.pricing_type === "free" || p.price_ngn === 0) return { label: "Free", challenge: false };
  return null;
}

export default function AcademyScreen() {
  const { C } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AcademyStackParams>>();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["academy-products"],
    queryFn:  getAcademyProducts,
  });

  const products = data?.products ?? [];
  const enrolled = products.filter(p => p.enrollment && p.enrollment.status !== "cancelled");
  const filtered = products.filter(p => filter === "all" || p.product_type === filter);

  const open = (p: AcademyProductRow) =>
    p.product_type === "challenge" && p.enrollment
      ? navigation.navigate("ChallengeDay", { id: p.id })
      : navigation.navigate("CourseDetail", { id: p.id });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 12 }}>
        <Text style={{ fontSize: 22, fontFamily: FONT.bold, color: C.text, letterSpacing: -0.4 }}>Academy</Text>
      </View>

      {isError && !data ? (
        <ErrorState message="Couldn't load the academy" onRetry={refetch} />
      ) : isLoading && !data ? (
        <View style={{ padding: 16, gap: 10 }}>{[1, 2, 3, 4].map(i => <Skeleton key={i} height={72} />)}</View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 16 + TAB_CLEARANCE, gap: 18 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.accent} />}
        >
          {enrolled.length > 0 && (
            <View>
              <SectionLabel>Continue learning</SectionLabel>
              <View style={{ gap: 8 }}>
                {enrolled.map(p => {
                  const color = productColor(p, C.accent);
                  const isChallenge = p.product_type === "challenge";
                  const { day, total } = challengeDay(p);
                  const pct = isChallenge
                    ? Math.round((day / total) * 100)
                    : p.total_lessons > 0 ? Math.round((p.completed_count / p.total_lessons) * 100) : 0;
                  return (
                    <Card key={p.id} onPress={() => open(p)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
                      <Ring pct={pct} size={44} stroke={5} color={color}>
                        <Text style={{ fontSize: 10.5, fontFamily: FONT.bold, color: C.text }}>{pct}%</Text>
                      </Ring>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ fontSize: 13.5, fontFamily: FONT.bold, color: C.text }}>{p.name}</Text>
                        <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textQuiet, marginTop: 2 }}>
                          {isChallenge ? `Day ${day} of ${total}` : "In progress"}
                        </Text>
                      </View>
                      <Icon name="chevR" size={16} color={color} strokeWidth={2} />
                    </Card>
                  );
                })}
              </View>
            </View>
          )}

          <View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <SectionLabel style={{ marginBottom: 0 }}>Browse everything</SectionLabel>
              <View style={{ flexDirection: "row", gap: 4 }}>
                {FILTERS.map(([k, label]) => {
                  const active = filter === k;
                  return (
                    <Pressable key={k} onPress={() => setFilter(k)} style={{
                      paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill,
                      borderWidth: 1, borderColor: active ? C.accent : C.border,
                      backgroundColor: active ? C.accentSoft : "transparent",
                    }}>
                      <Text allowFontScaling={false} style={{ fontSize: 11, fontFamily: FONT.semibold, color: active ? C.accent : C.textQuiet }}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {filtered.length === 0 ? (
              <EmptyState title="Nothing here yet" hint="New courses and challenges are on the way." />
            ) : (
              <View style={{ gap: 8 }}>
                {filtered.map(p => {
                  const color = productColor(p, C.accent);
                  const tag = productTag(p);
                  const hours = p.sections?.length
                    ? Math.max(1, Math.round(p.sections.flatMap(s => s.lessons).reduce((sum, l) => sum + (l.duration_secs ?? 0), 0) / 3600))
                    : null;
                  return (
                    <Card key={p.id} onPress={() => open(p)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
                      <View style={{
                        width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center",
                        backgroundColor: color + "20",
                      }}>
                        <Icon name={p.product_type === "challenge" ? "flame" : "play"} size={19} color={color} strokeWidth={1.7} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2 }}>
                          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13.5, fontFamily: FONT.bold, color: C.text }}>{p.name}</Text>
                          {tag ? (
                            <Chip
                              label={tag.label}
                              color={tag.challenge ? C.info : C.textMuted}
                              soft={tag.challenge ? C.infoSoft : C.surface}
                            />
                          ) : null}
                        </View>
                        <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textQuiet }}>
                          {p.product_type === "challenge"
                            ? `${p.challenge_config?.duration_days ?? 30}-day sprint`
                            : `${p.total_lessons} lessons${hours ? ` · ${hours}h` : ""}`}
                        </Text>
                      </View>
                      {p.enrollment ? (
                        <Icon name="chevR" size={16} color={C.textMuted} strokeWidth={2} />
                      ) : (
                        <Text style={{ fontSize: 12.5, fontFamily: FONT.bold, color: C.text }}>
                          {p.pricing_type === "free" || p.price_ngn === 0 ? "Free" : "→"}
                        </Text>
                      )}
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
