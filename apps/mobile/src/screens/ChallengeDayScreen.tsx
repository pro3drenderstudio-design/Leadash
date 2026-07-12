/**
 * Challenge day — Day badge + overall progress, today's tasks (lesson /
 * metric with auto-tracked progress / proof with link submission), and the
 * points leaderboard with the learner's own row highlighted.
 * Ported from the design's scrChallengeDay.
 */
import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable, TextInput, Alert } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { TAB_CLEARANCE } from "../lib/layout";
import { getChallenge, getAcademyLeaderboard, completeChallengeTask } from "../lib/api";
import { R, FONT } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { Icon, IconName } from "../components/Icon";
import { Card, Skeleton, ErrorState, ProgressBar, Avatar, Btn } from "../components/ui";
import type { AcademyStackParams } from "../navigation/types";
import type { ChallengeTaskRow } from "../types/academy";

function taskIcon(t: ChallengeTaskRow): IconName {
  if (t.completed) return "check";
  switch (t.task_type) {
    case "lesson": return "play";
    case "metric": return "chart";
    case "proof":  return "camera";
    case "live":   return "clock";
    default:        return "check";
  }
}

export default function ChallengeDayScreen() {
  const { C } = useTheme();
  const route = useRoute<RouteProp<AcademyStackParams, "ChallengeDay">>();
  const productId = route.params.id;
  const queryClient = useQueryClient();
  const [proofLinks, setProofLinks] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const challengeQ = useQuery({
    queryKey: ["academy-challenge", productId],
    queryFn:  () => getChallenge(productId),
  });
  const leaderboardQ = useQuery({
    queryKey: ["academy-leaderboard", productId],
    queryFn:  () => getAcademyLeaderboard(productId),
  });

  const data = challengeQ.data;
  const totalDays = data?.product.challenge_config?.duration_days ?? 30;

  // Current day = latest unlocked day with tasks (mirrors the web learner view)
  const currentDay = useMemo(() => {
    if (!data?.tasks.length) return 1;
    const unlockedDays = data.tasks.filter(t => t.unlocked).map(t => t.day);
    return unlockedDays.length ? Math.max(...unlockedDays) : 1;
  }, [data]);

  const todayTasks = (data?.tasks ?? []).filter(t => t.day === currentDay);
  const progressPct = Math.round(((data?.days_completed.length ?? 0) / totalDays) * 100);

  const taskColor = (t: ChallengeTaskRow) =>
    t.task_type === "lesson" ? C.info : t.task_type === "metric" ? C.violet : C.accent;

  async function submitTask(t: ChallengeTaskRow, extra?: { proof_text?: string; metric_value?: number }) {
    setActing(t.id);
    try {
      const link = proofLinks[t.id]?.trim();
      const res = await completeChallengeTask({
        task_id: t.id,
        ...(t.task_type === "proof" && link
          ? { proof_files: [{ url: link, name: "proof", type: "link" }] }
          : {}),
        ...extra,
      });
      if (res.error) {
        Alert.alert("Couldn't submit", res.error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["academy-challenge", productId] }),
          queryClient.invalidateQueries({ queryKey: ["academy-leaderboard", productId] }),
        ]);
      }
    } catch (e) {
      Alert.alert("Couldn't submit", e instanceof Error ? e.message : "Please try again");
    } finally {
      setActing(null);
    }
  }

  if (challengeQ.isError && !data) {
    return <View style={{ flex: 1, backgroundColor: C.bg }}><ErrorState message="Couldn't load the challenge" onRetry={challengeQ.refetch} /></View>;
  }

  const rows = leaderboardQ.data?.rows.slice(0, 10) ?? [];
  const me = leaderboardQ.data?.me ?? null;
  const showMeRow = me && !rows.some(r => r.is_me);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {challengeQ.isLoading && !data ? (
        <View style={{ padding: 16, gap: 10 }}>{[1, 2, 3].map(i => <Skeleton key={i} height={110} />)}</View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 16 + TAB_CLEARANCE, gap: 16 }}
          refreshControl={<RefreshControl refreshing={challengeQ.isRefetching} onRefresh={challengeQ.refetch} tintColor={C.accent} />}
        >
          {/* Day header */}
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <View style={{ backgroundColor: C.accent, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ fontSize: 11, fontFamily: FONT.bold, color: "#fff" }}>Day {currentDay}</Text>
              </View>
              <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textMuted }}>
                {currentDay} of {totalDays}
                {data?.gamification ? ` · ${data.gamification.points.toLocaleString()} pts` : ""}
                {data?.gamification?.streak_days ? ` · ${data.gamification.streak_days}-day streak` : ""}
              </Text>
            </View>
            <ProgressBar pct={progressPct} height={6} />
          </View>

          {/* Today's tasks */}
          <View>
            <Text style={{
              fontSize: 11, fontFamily: FONT.bold, letterSpacing: 0.8, textTransform: "uppercase",
              color: C.textQuiet, marginBottom: 10,
            }}>
              Today's tasks
            </Text>
            <View style={{ gap: 12 }}>
              {todayTasks.length === 0 ? (
                <Card style={{ padding: 16 }}>
                  <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: C.textQuiet, textAlign: "center" }}>
                    No tasks published for today yet — check back soon.
                  </Text>
                </Card>
              ) : todayTasks.map(t => {
                const color = taskColor(t);
                const metricTarget = t.metric_config?.target ?? 0;
                const metricCur = t.completion?.metric_value ?? 0;
                return (
                  <Card key={t.id} style={{ padding: 0, overflow: "hidden" }}>
                    <View style={{
                      flexDirection: "row", alignItems: "center", gap: 10,
                      paddingVertical: 12, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: C.border,
                    }}>
                      <View style={{
                        width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center",
                        backgroundColor: color + "18",
                      }}>
                        <Icon name={taskIcon(t)} size={14} color={color} strokeWidth={1.9} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, fontFamily: FONT.bold, color: C.text }}>{t.title}</Text>
                      <Text style={{ fontSize: 11, fontFamily: FONT.bold, color: t.completed ? C.success : C.textQuiet }}>
                        +{t.points}
                      </Text>
                    </View>
                    <View style={{ paddingVertical: 12, paddingHorizontal: 13 }}>
                      {t.completed ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                          <Icon name="check" size={14} color={C.success} strokeWidth={2.4} />
                          <Text style={{ fontSize: 12.5, fontFamily: FONT.semibold, color: C.success }}>Complete</Text>
                        </View>
                      ) : t.task_type === "metric" ? (
                        <View>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 7 }}>
                            <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textMuted }}>
                              {t.metric_config?.source === "leadash_outbox" ? "Auto-tracked from Leadash outbox" : "Track your progress"}
                            </Text>
                            <Text style={{ fontSize: 15, fontFamily: FONT.bold, color }}>
                              {metricCur}
                              <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: C.textMuted }}>/{metricTarget}</Text>
                            </Text>
                          </View>
                          <ProgressBar pct={metricTarget > 0 ? (metricCur / metricTarget) * 100 : 0} color={color} height={6} />
                          {t.metric_config?.source !== "leadash_outbox" && (
                            <Btn
                              label="Mark reached"
                              onPress={() => submitTask(t, { metric_value: metricTarget })}
                              loading={acting === t.id}
                              style={{ marginTop: 10, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 13 }}
                            />
                          )}
                        </View>
                      ) : t.task_type === "proof" ? (
                        <View>
                          <TextInput
                            placeholder="Paste a screenshot URL…"
                            placeholderTextColor={C.textQuiet}
                            value={proofLinks[t.id] ?? ""}
                            onChangeText={v => setProofLinks(prev => ({ ...prev, [t.id]: v }))}
                            autoCapitalize="none"
                            style={{
                              backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderStrong,
                              borderRadius: R.sm, paddingVertical: 9, paddingHorizontal: 11,
                              color: C.text, fontSize: 12.5, fontFamily: FONT.regular, marginBottom: 9,
                            }}
                          />
                          <Pressable
                            onPress={() => submitTask(t)}
                            disabled={acting === t.id || !(proofLinks[t.id] ?? "").trim()}
                            style={({ pressed }) => ({
                              alignSelf: "flex-start", backgroundColor: color, borderRadius: 8,
                              paddingVertical: 8, paddingHorizontal: 13,
                              opacity: acting === t.id || !(proofLinks[t.id] ?? "").trim() ? 0.4 : pressed ? 0.85 : 1,
                            })}
                          >
                            <Text style={{ fontSize: 12, fontFamily: FONT.bold, color: "#fff" }}>
                              {acting === t.id ? "Submitting…" : "Submit proof"}
                            </Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Btn
                          label={t.task_type === "lesson" ? "Mark watched" : "Mark done"}
                          variant="secondary"
                          onPress={() => submitTask(t)}
                          loading={acting === t.id}
                          style={{ alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 13 }}
                        />
                      )}
                    </View>
                  </Card>
                );
              })}
            </View>
          </View>

          {/* Leaderboard */}
          <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{
                fontSize: 11, fontFamily: FONT.bold, letterSpacing: 0.8, textTransform: "uppercase", color: C.textQuiet,
              }}>
                Leaderboard
              </Text>
              <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textQuiet }}>Points</Text>
            </View>
            <View style={{ gap: 6 }}>
              {leaderboardQ.isLoading && !leaderboardQ.data ? (
                [1, 2, 3].map(i => <Skeleton key={i} height={48} />)
              ) : rows.length === 0 ? (
                <Card style={{ padding: 14 }}>
                  <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: C.textQuiet, textAlign: "center" }}>
                    No participants on the board yet.
                  </Text>
                </Card>
              ) : (
                <>
                  {rows.map(r => (
                    <View key={r.enrollment_id} style={{
                      flexDirection: "row", alignItems: "center", gap: 11,
                      backgroundColor: r.is_me ? C.accentSoft : C.elevated,
                      borderWidth: 1, borderColor: r.is_me ? C.accentLine : C.border,
                      borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12,
                    }}>
                      <Text style={{ width: 20, fontSize: 12.5, fontFamily: FONT.bold, color: r.rank <= 3 ? C.warning : C.textQuiet }}>
                        {r.rank}
                      </Text>
                      <Avatar name={r.is_me ? "You" : r.workspace_name || "?"} size={28} color={r.is_me ? C.accent : "#9A9AA8"} />
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, fontFamily: FONT.semibold, color: C.text }}>
                        {r.is_me ? "You" : r.workspace_name || "Participant"}
                      </Text>
                      {r.graduated ? <Icon name="trophy" size={13} color={C.warning} strokeWidth={1.8} /> : null}
                      <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: r.is_me ? C.accent : C.text }}>
                        {r.points.toLocaleString()}
                      </Text>
                    </View>
                  ))}
                  {showMeRow && me ? (
                    <View style={{
                      flexDirection: "row", alignItems: "center", gap: 11,
                      backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accentLine,
                      borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12,
                    }}>
                      <Text style={{ width: 20, fontSize: 12.5, fontFamily: FONT.bold, color: C.textQuiet }}>{me.rank}</Text>
                      <Avatar name="You" size={28} color={C.accent} />
                      <Text style={{ flex: 1, fontSize: 12.5, fontFamily: FONT.semibold, color: C.text }}>You</Text>
                      <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: C.accent }}>{me.points.toLocaleString()}</Text>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
