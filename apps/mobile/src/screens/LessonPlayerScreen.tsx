/**
 * Lesson player — 16:9 Mux HLS video (signed playback token from the API),
 * title + Complete button, and the lesson body (text blocks + resources).
 * Ported from the design's scrLessonPlayer.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Linking, Alert, Pressable } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useVideoPlayer, VideoView } from "expo-video";
import { TAB_CLEARANCE } from "../lib/layout";
import { getAcademyLessons, getLessonContent, getLessonPlaybackToken, completeLesson } from "../lib/api";
import { R, FONT } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "../components/Icon";
import { Card, Skeleton, ErrorState } from "../components/ui";
import type { AcademyStackParams } from "../navigation/types";
import type { LessonContentBlock } from "../types/academy";

function blockText(block: LessonContentBlock): string | null {
  if (typeof block.content === "string") return block.content;
  if (block.content && typeof block.content === "object") {
    const c = block.content as Record<string, unknown>;
    if (typeof c.text === "string") return c.text;
    if (typeof c.body === "string") return c.body;
    if (typeof c.html === "string") return c.html.replace(/<[^>]+>/g, "");
  }
  return null;
}

export default function LessonPlayerScreen() {
  const { C } = useTheme();
  const route = useRoute<RouteProp<AcademyStackParams, "LessonPlayer">>();
  const navigation = useNavigation<NativeStackNavigationProp<AcademyStackParams>>();
  const { productId, lessonId } = route.params;
  const queryClient = useQueryClient();
  const [completing, setCompleting] = useState(false);

  const lessonsQ = useQuery({
    queryKey: ["academy-lessons", productId],
    queryFn:  () => getAcademyLessons(productId),
  });
  const contentQ = useQuery({
    queryKey: ["lesson-content", lessonId],
    queryFn:  () => getLessonContent(lessonId),
  });

  const lesson = useMemo(
    () => lessonsQ.data?.sections.flatMap(s => s.lessons).find(l => l.id === lessonId) ?? null,
    [lessonsQ.data, lessonId],
  );

  const tokenQ = useQuery({
    queryKey: ["lesson-token", lessonId],
    queryFn:  () => getLessonPlaybackToken(lessonId),
    enabled:  Boolean(lesson?.mux_playback_id),
    staleTime: 30 * 60_000,
  });

  const streamUrl = tokenQ.data
    ? `https://stream.mux.com/${tokenQ.data.playback_id}.m3u8?token=${tokenQ.data.token}`
    : null;

  // The hook creates the player once with the initial source (null while the
  // signed token loads) — source-prop changes are ignored after creation, so
  // swap it in explicitly when the token arrives.
  const player = useVideoPlayer(streamUrl, p => { p.timeUpdateEventInterval = 5; });
  useEffect(() => {
    if (streamUrl) player.replaceAsync(streamUrl).catch(() => {});
  }, [streamUrl, player]);

  async function handleComplete() {
    setCompleting(true);
    try {
      const res = await completeLesson(lessonId, productId);
      if (res.error) Alert.alert("Couldn't mark complete", res.error);
      else {
        await queryClient.invalidateQueries({ queryKey: ["academy-lessons", productId] });
        await queryClient.invalidateQueries({ queryKey: ["academy-products"] });
        navigation.goBack();
      }
    } catch (e) {
      Alert.alert("Couldn't mark complete", e instanceof Error ? e.message : "Please try again");
    } finally {
      setCompleting(false);
    }
  }

  if (lessonsQ.isError && !lessonsQ.data) {
    return <View style={{ flex: 1, backgroundColor: C.bg }}><ErrorState message="Couldn't load this lesson" onRetry={lessonsQ.refetch} /></View>;
  }

  const blocks = contentQ.data?.blocks ?? [];
  const resources = contentQ.data?.resources ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 + TAB_CLEARANCE }}>
        {/* Video area */}
        <View style={{
          marginHorizontal: 16, marginBottom: 16, aspectRatio: 16 / 9, borderRadius: R.lg,
          backgroundColor: "#000", overflow: "hidden", alignItems: "center", justifyContent: "center",
        }}>
          {streamUrl ? (
            <VideoView player={player} style={{ width: "100%", height: "100%" }} allowsFullscreen allowsPictureInPicture />
          ) : lesson?.mux_playback_id ? (
            <Skeleton height={60} style={{ width: 120 }} />
          ) : (
            <View style={{
              width: 54, height: 54, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.14)",
              alignItems: "center", justifyContent: "center",
            }}>
              <Icon name="play" size={24} color="#fff" fill />
            </View>
          )}
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <Text style={{ flex: 1, fontSize: 17, fontFamily: FONT.bold, color: C.text }}>
              {lesson?.title ?? "Lesson"}
            </Text>
            {!lesson?.completed && (
              <Pressable
                onPress={handleComplete}
                disabled={completing}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: 6,
                  backgroundColor: C.accent, borderRadius: R.sm, paddingVertical: 7, paddingHorizontal: 12,
                  opacity: completing ? 0.5 : pressed ? 0.85 : 1,
                })}
              >
                <Icon name="check" size={13} color="#fff" strokeWidth={2.4} />
                <Text style={{ fontSize: 12, fontFamily: FONT.bold, color: "#fff" }}>
                  {completing ? "Saving…" : "Complete"}
                </Text>
              </Pressable>
            )}
            {lesson?.completed && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="check" size={14} color={C.success} strokeWidth={2.4} />
                <Text style={{ fontSize: 12, fontFamily: FONT.bold, color: C.success }}>Completed</Text>
              </View>
            )}
          </View>

          {lesson?.description ? (
            <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: C.textMuted, lineHeight: 22, marginBottom: 12 }}>
              {lesson.description}
            </Text>
          ) : null}

          {blocks.map(b => {
            const text = blockText(b);
            if (!text) return null;
            return (
              <Text key={b.id} style={{ fontSize: 13, fontFamily: FONT.regular, color: C.textMuted, lineHeight: 22, marginBottom: 12 }}>
                {text}
              </Text>
            );
          })}

          {resources.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Text style={{
                fontSize: 11, fontFamily: FONT.bold, letterSpacing: 0.8, textTransform: "uppercase",
                color: C.textQuiet, marginBottom: 8,
              }}>
                Resources
              </Text>
              <View style={{ gap: 6 }}>
                {resources.map(r => (
                  <Card key={r.id} onPress={() => Linking.openURL(r.url).catch(() => {})} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12 }}>
                    <Icon name="chevR" size={14} color={C.accent} strokeWidth={2} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontFamily: FONT.semibold, color: C.text }}>{r.label}</Text>
                      {r.description ? <Text style={{ fontSize: 11.5, fontFamily: FONT.regular, color: C.textQuiet, marginTop: 1 }}>{r.description}</Text> : null}
                    </View>
                  </Card>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
