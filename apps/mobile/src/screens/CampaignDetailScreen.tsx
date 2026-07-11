import React from "react";
import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { getCampaign, getCampaignAnalytics, updateCampaign } from "../lib/api";
import { C, R, FONT, CAMPAIGN_STATUS } from "../theme/tokens";
import { Card, Chip, Skeleton, ErrorState } from "../components/ui";
import { Icon } from "../components/Icon";
import type { CampaignsStackParams } from "../navigation/types";

type Props = NativeStackScreenProps<CampaignsStackParams, "CampaignDetail">;

function StatCell({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: "45%", paddingVertical: 12, paddingHorizontal: 14 }}>
      <Text style={{ fontSize: 19, fontFamily: FONT.bold, color: color ?? C.text }}>{value}</Text>
      <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: C.textMuted, marginTop: 2 }}>{label}</Text>
    </Card>
  );
}

export default function CampaignDetailScreen({ route }: Props) {
  const { id } = route.params;
  const qc = useQueryClient();

  const campaignQ = useQuery({ queryKey: ["campaign", id], queryFn: () => getCampaign(id) });
  const analyticsQ = useQuery({ queryKey: ["campaign-analytics", id], queryFn: () => getCampaignAnalytics(id) });

  const toggleStatus = useMutation({
    mutationFn: (status: "active" | "paused") => updateCampaign(id, { status }),
    onMutate: async (status) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await qc.cancelQueries({ queryKey: ["campaign", id] });
      const prev = qc.getQueryData(["campaign", id]);
      qc.setQueryData(["campaign", id], (old: object | undefined) => old ? { ...old, status } : old);
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["campaign", id], ctx.prev); },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["campaign", id] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  const c = campaignQ.data;
  const a = analyticsQ.data;

  if (campaignQ.isError && !c) {
    return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center" }}>
      <ErrorState message="Couldn't load campaign" onRetry={campaignQ.refetch} />
    </View>;
  }

  const tone = c ? (CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.draft) : CAMPAIGN_STATUS.draft;
  const canToggle = c && (c.status === "active" || c.status === "paused");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
      refreshControl={<RefreshControl refreshing={campaignQ.isRefetching} onRefresh={() => { campaignQ.refetch(); analyticsQ.refetch(); }} tintColor={C.accent} />}
    >
      {!c ? (
        <View style={{ gap: 10 }}><Skeleton height={60} /><Skeleton height={160} /><Skeleton height={200} /></View>
      ) : (
        <>
          {/* Title + status + pause/resume */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontFamily: FONT.bold, color: C.text, lineHeight: 24, marginBottom: 8 }}>{c.name}</Text>
              <Chip label={c.status} color={tone.color} soft={tone.soft} />
            </View>
            {canToggle && (
              <Pressable
                onPress={() => toggleStatus.mutate(c.status === "active" ? "paused" : "active")}
                disabled={toggleStatus.isPending}
                style={{ width: 38, height: 38, borderRadius: R.pill, backgroundColor: C.surfaceStrong, alignItems: "center", justifyContent: "center", opacity: toggleStatus.isPending ? 0.5 : 1 }}
              >
                <Icon name={c.status === "active" ? "pause" : "play"} size={15} color={C.text} strokeWidth={2} />
              </Pressable>
            )}
          </View>

          {/* Stats grid */}
          {a ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <StatCell value={String(a.funnel.enrolled)} label="enrolled" />
              <StatCell value={`${a.stats.open_rate}%`} label="opened" color={C.info} />
              <StatCell value={`${a.stats.reply_rate}%`} label="replied" color={C.accent} />
              <StatCell value={String(a.funnel.bounced)} label="bounced" color={a.funnel.bounced > 0 ? C.danger : C.text} />
            </View>
          ) : analyticsQ.isLoading ? (
            <Skeleton height={140} />
          ) : null}

          {/* Sequence timeline */}
          {a && a.per_step.length > 0 && (
            <View>
              <Text style={{ fontSize: 11, fontFamily: FONT.bold, letterSpacing: 0.8, textTransform: "uppercase", color: C.textQuiet, marginBottom: 10 }}>Sequence</Text>
              {a.per_step.map((step, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 12, paddingBottom: i < a.per_step.length - 1 ? 18 : 0 }}>
                  <View style={{ alignItems: "center" }}>
                    <View style={{
                      width: 26, height: 26, borderRadius: R.pill,
                      backgroundColor: C.accentSoft, borderWidth: 2, borderColor: C.accent,
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <Text style={{ fontSize: 11, fontFamily: FONT.bold, color: C.accent }}>{i + 1}</Text>
                    </View>
                    {i < a.per_step.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: C.border, marginTop: 4 }} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 4 }}>
                    <Text style={{ fontSize: 13.5, fontFamily: FONT.bold, color: C.text, marginBottom: 3 }}>
                      {step.subject_template || (step.type === "wait" ? "Wait" : `Step ${i + 1}`)}
                    </Text>
                    <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textMuted }}>
                      {step.sent} sent · {step.open_rate}% opened · {step.reply_rate}% replied
                      {step.bounced > 0 ? ` · ${step.bounced} bounced` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Schedule info */}
          <Card>
            <Text style={{ fontSize: 11, fontFamily: FONT.bold, letterSpacing: 0.8, textTransform: "uppercase", color: C.textQuiet, marginBottom: 8 }}>Schedule</Text>
            <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: C.textMuted, lineHeight: 19 }}>
              {(c.send_days ?? []).join(", ") || "Any day"} · {c.send_start_time}–{c.send_end_time} ({c.timezone}){"\n"}
              Daily cap: {c.daily_cap} · {c.stop_on_reply ? "Stops on reply" : "Continues after reply"}
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}
