/**
 * Course detail — hero (icon, name, description), progress card when
 * enrolled, enroll CTA when not, and the curriculum grouped by section with
 * locked/done/playable lessons. Ported from the design's scrCourseDetail.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable, Linking, Alert } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { TAB_CLEARANCE } from "../lib/layout";
import { getAcademyProducts, getAcademyLessons, enrollFree } from "../lib/api";
import { R, FONT } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "../components/Icon";
import { Card, Btn, Skeleton, ErrorState, ProgressBar } from "../components/ui";
import { productColor } from "./AcademyScreen";
import type { AcademyStackParams } from "../navigation/types";

function fmtDuration(secs: number | null): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CourseDetailScreen() {
  const { C } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AcademyStackParams>>();
  const route = useRoute<RouteProp<AcademyStackParams, "CourseDetail">>();
  const productId = route.params.id;
  const queryClient = useQueryClient();
  const [enrolling, setEnrolling] = useState(false);

  const productsQ = useQuery({ queryKey: ["academy-products"], queryFn: getAcademyProducts });
  const lessonsQ = useQuery({
    queryKey: ["academy-lessons", productId],
    queryFn:  () => getAcademyLessons(productId),
  });

  const product = productsQ.data?.products.find(p => p.id === productId) ?? null;
  const sections = lessonsQ.data?.sections ?? [];
  const enrollment = lessonsQ.data?.enrollment ?? product?.enrollment ?? null;

  const allLessons = sections.flatMap(s => s.lessons);
  const completed = allLessons.filter(l => l.completed).length;
  const pct = allLessons.length > 0 ? Math.round((completed / allLessons.length) * 100) : 0;
  const color = product ? productColor(product, C.accent) : C.accent;
  const isFree = product ? (product.pricing_type === "free" || product.price_ngn === 0) : false;

  async function handleEnroll() {
    if (!product) return;
    if (!isFree) {
      // Paid checkout runs through Paystack — hand off to the web flow.
      Linking.openURL(`https://leadash.com/academy/enroll/${product.slug}`).catch(() => {});
      return;
    }
    setEnrolling(true);
    try {
      const res = await enrollFree(product.id);
      if (res.error) Alert.alert("Enrollment failed", res.error);
      else {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["academy-products"] }),
          queryClient.invalidateQueries({ queryKey: ["academy-lessons", productId] }),
        ]);
      }
    } catch (e) {
      Alert.alert("Enrollment failed", e instanceof Error ? e.message : "Please try again");
    } finally {
      setEnrolling(false);
    }
  }

  const loading = (productsQ.isLoading && !productsQ.data) || (lessonsQ.isLoading && !lessonsQ.data);

  if (lessonsQ.isError && !lessonsQ.data) {
    return <View style={{ flex: 1, backgroundColor: C.bg }}><ErrorState message="Couldn't load this course" onRetry={lessonsQ.refetch} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>{[1, 2, 3, 4].map(i => <Skeleton key={i} height={80} />)}</View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 16 + TAB_CLEARANCE, gap: 16 }}
          refreshControl={<RefreshControl refreshing={lessonsQ.isRefetching} onRefresh={lessonsQ.refetch} tintColor={C.accent} />}
        >
          <View>
            <View style={{
              width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center",
              backgroundColor: color + "20", marginBottom: 12,
            }}>
              <Icon name="play" size={20} color={color} strokeWidth={1.7} />
            </View>
            <Text style={{ fontSize: 19, fontFamily: FONT.bold, color: C.text, lineHeight: 25, marginBottom: 8 }}>
              {product?.name ?? "Course"}
            </Text>
            {product?.description ? (
              <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: C.textMuted, lineHeight: 21, marginBottom: 12 }}>
                {product.description}
              </Text>
            ) : null}
            {enrollment ? (
              <Card style={{ padding: 13 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: C.textMuted }}>
                    {completed} of {allLessons.length} lessons
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: FONT.bold, color: C.text }}>{pct}%</Text>
                </View>
                <ProgressBar pct={pct} color={color} height={7} />
              </Card>
            ) : null}
          </View>

          {!enrollment ? (
            <Btn
              label={isFree ? "Start free course" : "Enroll now"}
              onPress={handleEnroll}
              loading={enrolling}
            />
          ) : null}

          <View>
            <Text style={{
              fontSize: 11, fontFamily: FONT.bold, letterSpacing: 0.8, textTransform: "uppercase",
              color: C.textQuiet, marginBottom: 10,
            }}>
              Curriculum
            </Text>
            <View style={{ gap: 14 }}>
              {sections.map(sec => (
                <View key={sec.id}>
                  <Text style={{ fontSize: 12.5, fontFamily: FONT.bold, color: C.text, marginBottom: 8 }}>{sec.title}</Text>
                  <View style={{ gap: 6 }}>
                    {sec.lessons.map(l => {
                      const icon = l.completed ? "check" : !l.unlocked ? "lock" : "play";
                      const iconColor = l.completed ? C.success : !l.unlocked ? C.textQuiet : C.text;
                      return (
                        <Pressable
                          key={l.id}
                          disabled={!l.unlocked}
                          onPress={() => navigation.navigate("LessonPlayer", { productId, lessonId: l.id })}
                          style={({ pressed }) => ({
                            flexDirection: "row", alignItems: "center", gap: 11,
                            paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.sm,
                            backgroundColor: l.completed ? C.successSoft : C.elevated,
                            borderWidth: 1,
                            borderColor: l.completed ? "rgba(52,211,153,0.2)" : C.border,
                            opacity: !l.unlocked ? 0.5 : pressed ? 0.85 : 1,
                          })}
                        >
                          <Icon name={icon} size={15} color={iconColor} strokeWidth={1.9} />
                          <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontFamily: FONT.medium, color: l.completed ? C.success : C.text }}>
                            {l.title}
                          </Text>
                          <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: C.textQuiet }}>
                            {fmtDuration(l.duration_secs)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
