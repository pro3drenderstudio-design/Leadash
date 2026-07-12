import React, { useEffect, useRef } from "react";
import { NavigationContainer, DarkTheme, DefaultTheme, NavigationContainerRef, getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Pressable, Platform, StyleSheet, View, Text, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { useQuery } from "@tanstack/react-query";
import { R, FONT } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { Icon, IconName } from "../components/Icon";
import type { TabParams, HomeStackParams, AcademyStackParams, CampaignsStackParams, InboxStackParams, InboxesStackParams } from "./types";
import { pushDataFromResponse, PushData } from "../lib/push";
import { getNotifications } from "../lib/api";

import HomeScreen from "../screens/HomeScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import PrefsScreen from "../screens/PrefsScreen";
import AcademyScreen from "../screens/AcademyScreen";
import CourseDetailScreen from "../screens/CourseDetailScreen";
import LessonPlayerScreen from "../screens/LessonPlayerScreen";
import ChallengeDayScreen from "../screens/ChallengeDayScreen";
import CampaignsScreen from "../screens/CampaignsScreen";
import CampaignDetailScreen from "../screens/CampaignDetailScreen";
import InboxScreen from "../screens/InboxScreen";
import ThreadScreen from "../screens/ThreadScreen";
import InboxesScreen from "../screens/InboxesScreen";
import InboxDetailScreen from "../screens/InboxDetailScreen";

const Tab = createBottomTabNavigator<TabParams>();
const HomeStack = createNativeStackNavigator<HomeStackParams>();
const AcademyStack = createNativeStackNavigator<AcademyStackParams>();
const CampaignsStack = createNativeStackNavigator<CampaignsStackParams>();
const InboxStack = createNativeStackNavigator<InboxStackParams>();
const InboxesStack = createNativeStackNavigator<InboxesStackParams>();

function useStackScreenOptions(): NativeStackNavigationOptions {
  const { C } = useTheme();
  return {
    headerStyle: { backgroundColor: C.bg },
    headerTintColor: C.text,
    headerTitleStyle: { fontFamily: FONT.bold, fontSize: 16 },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: C.bg },
  };
}

function HomeStackNav() {
  const { C } = useTheme();
  const opts = useStackScreenOptions();
  return (
    <HomeStack.Navigator screenOptions={opts}>
      <HomeStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Notifications" component={NotificationsScreen} options={({ navigation }) => ({
        title: "Notifications",
        headerRight: () => (
          <Pressable
            onPress={() => navigation.navigate("Prefs")}
            hitSlop={8}
            style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="gear" size={18} color={C.textMuted} />
          </Pressable>
        ),
      })} />
      <HomeStack.Screen name="Prefs" component={PrefsScreen} options={{ title: "Settings" }} />
    </HomeStack.Navigator>
  );
}

function AcademyStackNav() {
  const opts = useStackScreenOptions();
  return (
    <AcademyStack.Navigator screenOptions={opts}>
      <AcademyStack.Screen name="Academy" component={AcademyScreen} options={{ headerShown: false }} />
      <AcademyStack.Screen name="CourseDetail" component={CourseDetailScreen} options={{ title: "Course" }} />
      <AcademyStack.Screen name="LessonPlayer" component={LessonPlayerScreen} options={{ title: "Lesson" }} />
      <AcademyStack.Screen name="ChallengeDay" component={ChallengeDayScreen} options={{ title: "Challenge" }} />
    </AcademyStack.Navigator>
  );
}

function CampaignsStackNav() {
  const opts = useStackScreenOptions();
  return (
    <CampaignsStack.Navigator screenOptions={opts}>
      <CampaignsStack.Screen name="Campaigns" component={CampaignsScreen} options={{ headerShown: false }} />
      <CampaignsStack.Screen name="CampaignDetail" component={CampaignDetailScreen} options={{ title: "Campaign" }} />
    </CampaignsStack.Navigator>
  );
}

function InboxStackNav() {
  const opts = useStackScreenOptions();
  return (
    <InboxStack.Navigator screenOptions={opts}>
      <InboxStack.Screen name="Inbox" component={InboxScreen} options={{ headerShown: false }} />
      <InboxStack.Screen name="Thread" component={ThreadScreen} options={{ title: "Conversation" }} />
    </InboxStack.Navigator>
  );
}

function InboxesStackNav() {
  const opts = useStackScreenOptions();
  return (
    <InboxesStack.Navigator screenOptions={opts}>
      <InboxesStack.Screen name="Inboxes" component={InboxesScreen} options={{ headerShown: false }} />
      <InboxesStack.Screen name="InboxDetail" component={InboxDetailScreen} options={{ title: "Inbox health" }} />
    </InboxesStack.Navigator>
  );
}

const TAB_ICON: Record<keyof TabParams, IconName> = {
  HomeTab:      "home",
  AcademyTab:   "academy",
  CampaignsTab: "campaign",
  InboxTab:     "inbox",
  InboxesTab:   "server",
};

// ── Floating glass pill tab bar (iOS) ─────────────────────────────────────────
// WhatsApp-style: a rounded capsule inset from the edges, blur material,
// an active-tab highlight capsule that springs between tabs, haptic ticks.
function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { C, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = React.useState(0);
  const slide = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: state.index,
      useNativeDriver: true,
      speed: 16,
      bounciness: 7,
    }).start();
  }, [state.index, slide]);

  // Hide inside a conversation (Thread sets tabBarStyle: display none)
  const focusedOptions = descriptors[state.routes[state.index].key].options;
  if ((focusedOptions.tabBarStyle as { display?: string } | undefined)?.display === "none") {
    return null;
  }

  const PAD = 5;
  const tabWidth = barWidth > 0 ? (barWidth - PAD * 2) / state.routes.length : 0;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 20, right: 20, bottom: Math.max(insets.bottom, 16) + 6 }}
    >
      <View
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        style={{
          height: 66,
          borderRadius: 33,
          overflow: "hidden",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.10)",
          shadowColor: "#000",
          shadowOpacity: isDark ? 0.45 : 0.16,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <BlurView
          tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
          intensity={85}
          style={StyleSheet.absoluteFill}
        />
        {/* subtle inner sheen */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.35)" }]} />

        {/* sliding active capsule */}
        {tabWidth > 0 && (
          <Animated.View
            style={{
              position: "absolute",
              top: PAD + 2,
              bottom: PAD + 2,
              left: PAD,
              width: tabWidth,
              borderRadius: 26,
              backgroundColor: isDark ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.07)",
              transform: [{
                translateX: slide.interpolate({
                  inputRange: [0, Math.max(state.routes.length - 1, 1)],
                  outputRange: [0, tabWidth * Math.max(state.routes.length - 1, 1)],
                }),
              }],
            }}
          />
        )}

        <View style={{ flex: 1, flexDirection: "row", paddingHorizontal: PAD }}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const label = options.title ?? route.name;
            const badge = options.tabBarBadge;

            return (
              <Pressable
                key={route.key}
                onPress={() => {
                  if (!focused) {
                    Haptics.selectionAsync().catch(() => {});
                    navigation.navigate(route.name);
                  } else {
                    navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  }
                }}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }}
              >
                <View>
                  <Icon
                    name={TAB_ICON[route.name as keyof TabParams]}
                    size={22}
                    color={focused ? C.accent : C.textMuted}
                    strokeWidth={focused ? 2.1 : 1.7}
                  />
                  {badge != null && (
                    <View style={{
                      position: "absolute", top: -5, right: -10,
                      minWidth: 16, height: 16, borderRadius: R.pill,
                      backgroundColor: C.accent, paddingHorizontal: 4,
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <Text style={{ fontSize: 9, fontFamily: FONT.bold, color: "#fff" }}>{String(badge)}</Text>
                    </View>
                  )}
                </View>
                <Text style={{
                  fontSize: 10.5,
                  fontFamily: focused ? FONT.bold : FONT.medium,
                  color: focused ? C.accent : C.textMuted,
                }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function Tabs() {
  const { C, isDark } = useTheme();
  const { data: notifData } = useQuery({
    queryKey: ["notifications", 0],
    queryFn:  () => getNotifications(0),
    refetchInterval: 60_000,
  });
  const unread = notifData?.unread_count ?? 0;

  return (
    <Tab.Navigator
      tabBar={Platform.OS === "ios" ? (props) => <GlassTabBar {...props} /> : undefined}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? "rgba(14,14,19,0.98)" : C.elevated,
          borderTopColor: C.border,
        },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.textQuiet,
        tabBarLabelStyle: { fontFamily: FONT.semibold, fontSize: 10.5 },
        tabBarIcon: ({ color, focused }) => (
          <Icon name={TAB_ICON[route.name as keyof TabParams]} size={21} color={color} strokeWidth={focused ? 2.1 : 1.8} />
        ),
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStackNav} options={{ title: "Home" }} />
      <Tab.Screen name="AcademyTab" component={AcademyStackNav} options={{ title: "Academy" }} />
      <Tab.Screen name="CampaignsTab" component={CampaignsStackNav} options={{ title: "Campaigns" }} />
      <Tab.Screen name="InboxTab" component={InboxStackNav} options={({ route }) => ({
        title: "Inbox",
        tabBarBadge: unread > 0 ? (unread > 9 ? "9+" : unread) : undefined,
        tabBarBadgeStyle: { backgroundColor: C.accent, color: "#fff", fontSize: 9, fontFamily: FONT.bold },
        // Hide the tab bar inside a conversation so the composer sits flush
        ...(getFocusedRouteNameFromRoute(route) === "Thread"
          ? { tabBarStyle: { display: "none" as const } }
          : {}),
      })} />
      <Tab.Screen name="InboxesTab" component={InboxesStackNav} options={{ title: "Inboxes" }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { C, isDark } = useTheme();
  const navRef = useRef<NavigationContainerRef<TabParams>>(null);

  // Push tap → deep navigation (foreground taps + cold start)
  useEffect(() => {
    function navigate(data: PushData) {
      const nav = navRef.current;
      if (!nav) return;
      if (data.enrollment_id) {
        nav.navigate("InboxTab", { screen: "Thread", params: { enrollmentId: data.enrollment_id }, initial: false } as never);
      } else if (data.campaign_id) {
        nav.navigate("CampaignsTab", { screen: "CampaignDetail", params: { id: data.campaign_id }, initial: false } as never);
      } else if (data.inbox_id) {
        nav.navigate("InboxesTab", { screen: "InboxDetail", params: { id: data.inbox_id }, initial: false } as never);
      } else {
        nav.navigate("HomeTab", { screen: "Notifications", initial: false } as never);
      }
    }

    const sub = Notifications.addNotificationResponseReceivedListener(r => navigate(pushDataFromResponse(r)));
    Notifications.getLastNotificationResponseAsync().then(r => { if (r) setTimeout(() => navigate(pushDataFromResponse(r)), 300); });
    return () => sub.remove();
  }, []);

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: C.bg,
      card:       C.bg,
      text:       C.text,
      primary:    C.accent,
      border:     C.border,
    },
  };

  return (
    <NavigationContainer ref={navRef} theme={navTheme}>
      <Tabs />
    </NavigationContainer>
  );
}
