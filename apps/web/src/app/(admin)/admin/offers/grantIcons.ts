import {
  ChartBarLineIcon,
  Mailbox01Icon,
  Coins01Icon,
  UserGroupIcon,
  GraduationScrollIcon,
  ServerStack01Icon,
  UserMultipleIcon,
  Award01Icon,
} from "@hugeicons/core-free-icons";
import type { OfferGrantType } from "@/types/offers";

/** Shared per-grant-type icon registry — reused by the offer library, builder, and analytics screens. */
export const GRANT_ICONS: Record<OfferGrantType, typeof ChartBarLineIcon> = {
  plan: ChartBarLineIcon,
  inbox: Mailbox01Icon,
  credits: Coins01Icon,
  community: UserGroupIcon,
  academy: GraduationScrollIcon,
  ip: ServerStack01Icon,
  seats: UserMultipleIcon,
  custom: Award01Icon,
};

export const GRANT_HINTS: Record<OfferGrantType, string> = {
  plan: "Grant a Leadash plan tier for N months",
  inbox: "Sending inboxes, optionally free for a while",
  credits: "One-time or recurring lead credits",
  community: "Invite to a private community",
  academy: "Unlock an Academy course or challenge",
  ip: "Dedicated sending IP address",
  seats: "Extra team seats on the workspace",
  custom: "Anything else — fulfilled manually",
};
