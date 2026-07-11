import React, { useEffect, useRef } from "react";
import { NavigationContainer, DarkTheme, NavigationContainerRef, getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import * as Notifications from "expo-notifications";
import { useQuery } from "@tanstack/react-query";
import { C, FONT } from "../theme/tokens";
import { Icon, IconName } from "../components/Icon";
import type { TabParams, HomeStackParams, CampaignsStackParams, InboxStackParams, InboxesStackParams } from "./types";
import { pushDataFromResponse, PushData } from "../lib/push";
import { getNotifications } from "../lib/api";

import HomeScreen from "../screens/HomeScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import PrefsScreen from "../screens/PrefsScreen";
import CampaignsScreen from "../screens/CampaignsScreen";
import CampaignDetailScreen from "../screens/CampaignDetailScreen";
import InboxScreen from "../screens/InboxScreen";
import ThreadScreen from "../screens/ThreadScreen";
import InboxesScreen from "../screens/InboxesScreen";
import InboxDetailScreen from "../screens/InboxDetailScreen";

const Tab = createBottomTabNavigator<TabParams>();
const HomeStack = createNativeStackNavigator<HomeStackParams>();
const CampaignsStack = createNativeStackNavigator<CampaignsStackParams>();
const InboxStack = createNativeStackNavigator<InboxStackParams>();
const InboxesStack = createNativeStackNavigator<InboxesStackParams>();

const stackScreenOptions = {
  headerStyle: { backgroundColor: C.bg },
  headerTintColor: C.text,
  headerTitleStyle: { fontFamily: FONT.bold, fontSize: 16 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: C.bg },
} as const;

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen name="Home" component={HomeScreen} options={({ navigation }) => ({
        headerShown: false,
      })} />
      <HomeStack.Screen name="Notifications" component={NotificationsScreen} options={({ navigation }) => ({
        title: "Notifications",
        headerRight: () => (
          <Pressable onPress={() => navigation.navigate("Prefs")} hitSlop={8}>
            <Icon name="gear" size={18} color={C.textMuted} />
          </Pressable>
        ),
      })} />
      <HomeStack.Screen name="Prefs" component={PrefsScreen} options={{ title: "Settings" }} />
    </HomeStack.Navigator>
  );
}

function CampaignsStackNav() {
  return (
    <CampaignsStack.Navigator screenOptions={stackScreenOptions}>
      <CampaignsStack.Screen name="Campaigns" component={CampaignsScreen} options={{ headerShown: false }} />
      <CampaignsStack.Screen name="CampaignDetail" component={CampaignDetailScreen} options={{ title: "Campaign" }} />
    </CampaignsStack.Navigator>
  );
}

function InboxStackNav() {
  return (
    <InboxStack.Navigator screenOptions={stackScreenOptions}>
      <InboxStack.Screen name="Inbox" component={InboxScreen} options={{ headerShown: false }} />
      <InboxStack.Screen name="Thread" component={ThreadScreen} options={{ title: "Conversation" }} />
    </InboxStack.Navigator>
  );
}

function InboxesStackNav() {
  return (
    <InboxesStack.Navigator screenOptions={stackScreenOptions}>
      <InboxesStack.Screen name="Inboxes" component={InboxesScreen} options={{ headerShown: false }} />
      <InboxesStack.Screen name="InboxDetail" component={InboxDetailScreen} options={{ title: "Inbox health" }} />
    </InboxesStack.Navigator>
  );
}

const TAB_ICON: Record<keyof TabParams, IconName> = {
  HomeTab:      "home",
  CampaignsTab: "campaign",
  InboxTab:     "inbox",
  InboxesTab:   "server",
};

function Tabs() {
  const insets = useSafeAreaInsets();
  const { data: notifData } = useQuery({
    queryKey: ["notifications", 0],
    queryFn:  () => getNotifications(0),
    refetchInterval: 60_000,
  });
  const unread = notifData?.unread_count ?? 0;

  // iOS gets a WhatsApp-style liquid-glass pill: a floating rounded capsule
  // inset from the edges, blur background, active tab in its own highlight
  // capsule. Android keeps the solid docked Material bar.
  const glassTabBar = Platform.OS === "ios"
    ? {
        tabBarStyle: {
          position: "absolute" as const,
          left: 16,
          right: 16,
          bottom: Math.max(insets.bottom, 16) + 4,
          height: 64,
          borderRadius: 32,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "transparent",
          overflow: "hidden" as const,
          elevation: 0,
          paddingBottom: 0,
        },
        tabBarItemStyle: {
          borderRadius: 24,
          marginHorizontal: 5,
          marginVertical: 8,
          overflow: "hidden" as const,
        },
        tabBarActiveBackgroundColor: "rgba(255,255,255,0.10)",
        tabBarBackground: () => (
          <BlurView tint="systemChromeMaterialDark" intensity={90} style={StyleSheet.absoluteFill} />
        ),
      }
    : {
        tabBarStyle: {
          backgroundColor: "rgba(14,14,19,0.98)",
          borderTopColor: C.border,
        },
      };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        ...glassTabBar,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.textQuiet,
        tabBarLabelStyle: { fontFamily: FONT.semibold, fontSize: 10.5 },
        tabBarIcon: ({ color, focused }) => (
          <Icon name={TAB_ICON[route.name as keyof TabParams]} size={21} color={color} strokeWidth={focused ? 2.1 : 1.8} />
        ),
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStackNav} options={{ title: "Home" }} />
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

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: C.bg,
    card:       C.bg,
    text:       C.text,
    primary:    C.accent,
    border:     C.border,
  },
};

export default function AppNavigator() {
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

  return (
    <NavigationContainer ref={navRef} theme={navTheme}>
      <Tabs />
    </NavigationContainer>
  );
}
