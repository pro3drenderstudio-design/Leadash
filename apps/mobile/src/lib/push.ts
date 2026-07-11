/**
 * Push notification registration + deep-link payload handling.
 * Remote push requires a dev/preview/production build — it does NOT work in
 * Expo Go (SDK 53+).
 */
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { registerDevice } from "./api";

const TOKEN_KEY = "ld_push_token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
  }),
});

export async function getStoredPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

/**
 * Ask permission, fetch the Expo push token and register it with the API.
 * Call after login + workspace selection. Safe to call repeatedly.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulators can't receive remote push

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#F97316",
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) return; // not an EAS build yet — skip silently

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await registerDevice(token, Platform.OS === "ios" ? "ios" : "android", Device.deviceName ?? undefined);
  } catch (e) {
    // Push is best-effort; never block the app on registration failures.
    console.warn("[push] registration failed:", e);
  }
}

export interface PushData {
  type?:          "reply" | "milestone" | "health";
  enrollment_id?: string;
  campaign_id?:   string;
  inbox_id?:      string;
}

/** Extract our payload from a notification response (tap). */
export function pushDataFromResponse(response: Notifications.NotificationResponse): PushData {
  return (response.notification.request.content.data ?? {}) as PushData;
}
