import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, FlatList, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import {
  getConversation, sendCrmReply, updateCrmStatus, suggestReply,
  ConversationMessage,
} from "../lib/api";
import { R, FONT } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { Skeleton, ErrorState, Chip } from "../components/ui";
import { Icon } from "../components/Icon";
import type { InboxStackParams } from "../navigation/types";
import { timeAgo } from "../lib/format";

type Props = NativeStackScreenProps<InboxStackParams, "Thread">;

function Bubble({ m }: { m: ConversationMessage }) {
  const { C } = useTheme();
  const isReply = m.type === "reply"; // from the lead
  const failed  = m.status === "bounced" || m.status === "failed";
  const text    = isReply ? (m.body_text ?? "") : (m.body ?? "");
  return (
    <View style={{ alignItems: isReply ? "flex-start" : "flex-end", marginBottom: 12 }}>
      <View style={{
        maxWidth: "84%",
        backgroundColor: isReply ? C.elevated : C.accentSoft,
        borderWidth: 1,
        borderColor: failed ? C.danger : isReply ? C.border : C.accentLine,
        borderTopLeftRadius: isReply ? 4 : 16,
        borderTopRightRadius: isReply ? 16 : 4,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        paddingVertical: 10, paddingHorizontal: 13,
      }}>
        {m.subject ? (
          <Text style={{ fontSize: 11, fontFamily: FONT.bold, color: C.textQuiet, marginBottom: 4 }}>{m.subject}</Text>
        ) : null}
        <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: C.text, lineHeight: 19.5 }}>
          {text.length > 1500 ? `${text.slice(0, 1500)}…` : text}
        </Text>
        {failed && (
          <Text style={{ fontSize: 10.5, fontFamily: FONT.bold, color: C.danger, marginTop: 5 }}>
            {m.status === "bounced" ? "Bounced" : "Failed to send"}
          </Text>
        )}
      </View>
      <Text style={{ fontSize: 10.5, fontFamily: FONT.regular, color: C.textQuiet, marginTop: 4 }}>
        {timeAgo(m.timestamp)}{!isReply && m.opened_at ? " · opened" : ""}
      </Text>
    </View>
  );
}

export default function ThreadScreen({ route }: Props) {
  const { C, CRM_STATUS } = useTheme();
  const { enrollmentId } = route.params;
  const qc = useQueryClient();
  const listRef = useRef<FlatList>(null);

  const [reply, setReply] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["conversation", enrollmentId],
    queryFn:  () => getConversation(enrollmentId),
  });

  // Thread status comes from the threads list cache when available
  const threadsCache = qc.getQueriesData<{ pages?: { threads: { enrollment_id: string; crm_status: string }[] }[] }>({ queryKey: ["crm-threads"] });
  let crmStatus = "neutral";
  for (const [, data] of threadsCache) {
    const hit = data?.pages?.flatMap(p => p.threads).find(t => t.enrollment_id === enrollmentId);
    if (hit) { crmStatus = hit.crm_status; break; }
  }
  const [status, setStatus] = useState(crmStatus);
  useEffect(() => { setStatus(crmStatus); }, [crmStatus]);

  const send = useMutation({
    mutationFn: () => sendCrmReply(enrollmentId, reply.trim()),
    onSuccess: (d) => {
      if (!d.ok && d.error) { return; }
      setReply("");
      setSuggestion(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["conversation", enrollmentId] });
      qc.invalidateQueries({ queryKey: ["crm-threads"] });
    },
  });

  const setStatusMut = useMutation({
    mutationFn: (s: string) => updateCrmStatus(enrollmentId, s),
    onMutate: (s) => { setStatus(s); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["crm-threads"] }),
  });

  const suggest = useMutation({
    mutationFn: () => suggestReply(enrollmentId),
    onSuccess: (d) => { if (d.suggestion) setSuggestion(d.suggestion); },
  });

  const messages = q.data?.messages ?? [];

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [messages.length]);

  if (q.isError && messages.length === 0) {
    return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center" }}>
      <ErrorState message="Couldn't load conversation" onRetry={q.refetch} />
    </View>;
  }

  const tone = CRM_STATUS[status] ?? CRM_STATUS.neutral;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      style={{ flex: 1, backgroundColor: C.bg }}
    >
      {/* Status chips row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 7 }}>
        {Object.entries(CRM_STATUS).map(([key, t]) => {
          const active = status === key;
          return (
            <Pressable key={key} onPress={() => setStatusMut.mutate(key)} style={{
              paddingHorizontal: 11, paddingVertical: 5, borderRadius: R.pill,
              backgroundColor: active ? t.soft : "transparent",
              borderWidth: 1, borderColor: active ? t.color : C.border,
            }}>
              <Text style={{ fontSize: 11.5, lineHeight: 15, fontFamily: FONT.semibold, color: active ? t.color : C.textQuiet }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Messages */}
      {q.isLoading ? (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <Skeleton height={72} style={{ width: "80%" }} />
          <Skeleton height={72} style={{ width: "80%", alignSelf: "flex-end" }} />
          <Skeleton height={72} style={{ width: "70%" }} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => `${m.type}-${m.id}`}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          renderItem={({ item }) => <Bubble m={item} />}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", marginTop: 60, fontSize: 12.5, fontFamily: FONT.regular, color: C.textQuiet }}>
              No messages yet
            </Text>
          }
        />
      )}

      {/* AI suggestion card */}
      {suggestion && (
        <View style={{
          marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: R.md,
          backgroundColor: C.violetSoft, borderWidth: 1, borderColor: "rgba(167,139,250,0.25)",
          flexDirection: "row", gap: 8, alignItems: "flex-start",
        }}>
          <Icon name="ai" size={15} color={C.violet} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontFamily: FONT.bold, color: C.violet, marginBottom: 4 }}>AI suggested reply</Text>
            <Text style={{ fontSize: 12.5, fontFamily: FONT.regular, color: C.textMuted, lineHeight: 18 }}>{suggestion}</Text>
          </View>
          <Pressable onPress={() => { setReply(suggestion); setSuggestion(null); }}>
            <Text style={{ fontSize: 11.5, fontFamily: FONT.bold, color: C.violet }}>Use</Text>
          </Pressable>
        </View>
      )}

      {/* Send error */}
      {send.isError || (send.data && !send.data.ok) ? (
        <Text style={{ marginHorizontal: 16, marginBottom: 6, fontSize: 12, fontFamily: FONT.medium, color: C.danger }}>
          {send.error instanceof Error ? send.error.message : send.data?.error ?? "Send failed"}
        </Text>
      ) : null}

      {/* Composer */}
      <View style={{
        flexDirection: "row", alignItems: "flex-end", gap: 8,
        paddingHorizontal: 12, paddingVertical: 10,
        borderTopWidth: 1, borderTopColor: C.border,
      }}>
        <Pressable
          onPress={() => suggest.mutate()}
          disabled={suggest.isPending}
          style={{ width: 38, height: 38, borderRadius: R.pill, backgroundColor: C.violetSoft, alignItems: "center", justifyContent: "center" }}
        >
          {suggest.isPending
            ? <ActivityIndicator size="small" color={C.violet} />
            : <Icon name="ai" size={16} color={C.violet} />}
        </Pressable>
        <TextInput
          style={{
            flex: 1, minHeight: 38, maxHeight: 120,
            backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderStrong,
            borderRadius: 19, paddingHorizontal: 14, paddingVertical: 9,
            fontSize: 13, fontFamily: FONT.regular, color: C.text,
          }}
          placeholder="Type a reply…"
          placeholderTextColor={C.textQuiet}
          value={reply}
          onChangeText={setReply}
          multiline
        />
        <Pressable
          onPress={() => send.mutate()}
          disabled={!reply.trim() || send.isPending}
          style={{
            width: 38, height: 38, borderRadius: R.pill, backgroundColor: C.accent,
            alignItems: "center", justifyContent: "center",
            opacity: !reply.trim() || send.isPending ? 0.4 : 1,
          }}
        >
          {send.isPending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Icon name="send" size={15} color="#fff" strokeWidth={2} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
