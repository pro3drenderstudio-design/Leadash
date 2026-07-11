import React from "react";
import { TAB_CLEARANCE } from "../lib/layout";
import { View, Text, ScrollView, Switch, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPrefs, updatePrefs, NotificationPrefs, unregisterDevice } from "../lib/api";
import { supabase } from "../lib/supabase";
import { clearWorkspaceId } from "../lib/workspace";
import { getStoredPushToken } from "../lib/push";
import { C, FONT } from "../theme/tokens";
import { Card, Skeleton, ErrorState, Btn, SectionLabel } from "../components/ui";

function PrefRow({ label, hint, value, onChange, disabled }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12, opacity: disabled ? 0.4 : 1 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontFamily: FONT.semibold, color: C.text }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textQuiet, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: C.surfaceStrong, true: C.accent }}
        thumbColor="#fff"
      />
    </View>
  );
}

export default function PrefsScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["prefs"], queryFn: getPrefs });

  const save = useMutation({
    mutationFn: (d: Partial<NotificationPrefs>) => updatePrefs({
      ...d,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: ["prefs"] });
      const prev = qc.getQueryData<{ prefs: NotificationPrefs }>(["prefs"]);
      if (prev) qc.setQueryData(["prefs"], { prefs: { ...prev.prefs, ...d } });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["prefs"], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["prefs"] }),
  });

  async function signOut() {
    Alert.alert("Sign out", "You'll stop receiving push notifications on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out", style: "destructive",
        onPress: async () => {
          try {
            const token = await getStoredPushToken();
            if (token) await unregisterDevice(token).catch(() => {});
          } finally {
            await clearWorkspaceId();
            await supabase.auth.signOut();
          }
        },
      },
    ]);
  }

  const p = q.data?.prefs;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 16 + TAB_CLEARANCE, gap: 16 }}>
      {q.isError && !p ? (
        <ErrorState message="Couldn't load preferences" onRetry={q.refetch} />
      ) : !p ? (
        <View style={{ gap: 10 }}><Skeleton height={200} /></View>
      ) : (
        <>
          <View>
            <SectionLabel>Push notifications</SectionLabel>
            <Card>
              <PrefRow
                label="New replies"
                hint="When a lead replies to a campaign"
                value={p.replies_enabled}
                onChange={v => save.mutate({ replies_enabled: v })}
              />
              <PrefRow
                label="Positive replies only"
                hint="Only interested / meeting-booked replies"
                value={p.positive_only}
                disabled={!p.replies_enabled}
                onChange={v => save.mutate({ positive_only: v })}
              />
              <PrefRow
                label="Milestones"
                hint="Campaign finished, sending records"
                value={p.milestones_enabled}
                onChange={v => save.mutate({ milestones_enabled: v })}
              />
              <PrefRow
                label="Inbox health"
                hint="DNS failures and inbox errors"
                value={p.health_enabled}
                onChange={v => save.mutate({ health_enabled: v })}
              />
            </Card>
            <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: C.textQuiet, marginTop: 8 }}>
              Muted alerts still appear in the Notifications feed — these switches only control push banners.
            </Text>
          </View>

          <View>
            <SectionLabel>Account</SectionLabel>
            <Btn label="Sign out" variant="secondary" onPress={signOut} />
          </View>
        </>
      )}
    </ScrollView>
  );
}
