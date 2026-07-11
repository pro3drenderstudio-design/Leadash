/**
 * Cross-tab navigation helpers — jump from any screen to a detail screen in
 * another tab (Home's "needs attention" rows, notification taps, deep links).
 */
import { useNavigation, CommonActions } from "@react-navigation/native";

export function useAppNav() {
  const navigation = useNavigation();

  function toTabScreen(tab: string, screen: string, params?: object) {
    navigation.dispatch(
      CommonActions.navigate(tab, { screen, params, initial: false })
    );
  }

  return {
    toInbox:          ()                     => toTabScreen("InboxTab", "Inbox"),
    toThread:         (enrollmentId: string) => toTabScreen("InboxTab", "Thread", { enrollmentId }),
    toCampaignDetail: (id: string)           => toTabScreen("CampaignsTab", "CampaignDetail", { id }),
    toInboxDetail:    (id: string)           => toTabScreen("InboxesTab", "InboxDetail", { id }),
  };
}
