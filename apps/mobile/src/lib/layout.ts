import { Platform } from "react-native";

/**
 * On iOS the tab bar is a translucent glass layer floating over content
 * (position: absolute), so scrollable screens need extra bottom padding to
 * keep their last rows clear of it. Android keeps a solid docked bar.
 */
export const TAB_CLEARANCE = Platform.OS === "ios" ? 96 : 0;
