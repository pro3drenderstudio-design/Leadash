import type { NavigatorScreenParams } from "@react-navigation/native";

export type HomeStackParams = {
  Home:          undefined;
  Notifications: undefined;
  Prefs:         undefined;
};

export type AcademyStackParams = {
  Academy:      undefined;
  CourseDetail: { id: string };
  LessonPlayer: { productId: string; lessonId: string };
  ChallengeDay: { id: string };
};

export type CampaignsStackParams = {
  Campaigns:      undefined;
  CampaignDetail: { id: string };
};

export type InboxStackParams = {
  Inbox:  undefined;
  Thread: { enrollmentId: string };
};

export type InboxesStackParams = {
  Inboxes:     undefined;
  InboxDetail: { id: string };
};

export type TabParams = {
  HomeTab:      NavigatorScreenParams<HomeStackParams>;
  AcademyTab:   NavigatorScreenParams<AcademyStackParams>;
  CampaignsTab: NavigatorScreenParams<CampaignsStackParams>;
  InboxTab:     NavigatorScreenParams<InboxStackParams>;
  InboxesTab:   NavigatorScreenParams<InboxesStackParams>;
};
