import React, { useEffect, useState, useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./src/lib/supabase";
import { getWorkspaceId } from "./src/lib/workspace";
import { registerForPush } from "./src/lib/push";
import { C } from "./src/theme/tokens";
import LoginScreen from "./src/screens/LoginScreen";
import WorkspacePickerScreen from "./src/screens/WorkspacePickerScreen";
import AppNavigator from "./src/navigation";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime:    24 * 60 * 60 * 1000, // keep for offline viewing
      retry:     1,
    },
  },
});

export default function App() {
  const [fontsLoaded] = useFonts({
    "Geist-Regular":  require("./assets/fonts/Geist-Regular.ttf"),
    "Geist-Medium":   require("./assets/fonts/Geist-Medium.ttf"),
    "Geist-SemiBold": require("./assets/fonts/Geist-SemiBold.ttf"),
    "Geist-Bold":     require("./assets/fonts/Geist-Bold.ttf"),
  });

  const [session,      setSession]      = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [hasWorkspace, setHasWorkspace] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Resolve workspace whenever auth state changes
  useEffect(() => {
    if (!session) { setHasWorkspace(null); return; }
    getWorkspaceId().then(id => setHasWorkspace(!!id));
  }, [session]);

  // Register for push once signed in with a workspace
  useEffect(() => {
    if (session && hasWorkspace) registerForPush();
  }, [session, hasWorkspace]);

  const onLayout = useCallback(() => {
    if (fontsLoaded && sessionReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, sessionReady]);

  if (!fontsLoaded || !sessionReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1, backgroundColor: C.bg }} onLayout={onLayout}>
        <StatusBar style="light" />
        {!session ? (
          <LoginScreen />
        ) : hasWorkspace === null ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : !hasWorkspace ? (
          <WorkspacePickerScreen onPicked={() => setHasWorkspace(true)} />
        ) : (
          <AppNavigator />
        )}
      </View>
    </QueryClientProvider>
  );
}
