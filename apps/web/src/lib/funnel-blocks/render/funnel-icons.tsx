"use client";
import React from "react";
import {
  Check, CheckCircle, CheckSquare, X, XCircle, Circle, PlusCircle, MinusCircle,
  Star, Heart, Crown, Sparkles, Flame, Diamond, ThumbsUp, Flag,
  Mail, Phone, MessageCircle, MessageSquare, Send, Bell, AtSign,
  Home, ArrowRight, Link, MapPin, Globe, Rocket, Map,
  User, Users, Smile,
  Briefcase, DollarSign, BarChart2, TrendingUp, Award, Target, Shield,
  Wallet, ShoppingCart, CreditCard, Building2, Store, Package,
  Play, Camera, Image as ImageIcon, Download, Headphones, Mic, Monitor, Laptop, Smartphone, Tv,
  Clock, Calendar,
  Lock, Eye, Lightbulb, Settings, Search, Coffee, Layers,
  Zap, Plus, Minus, Wrench, Music, Leaf, Code, Wifi, Database, Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Simple custom brand icons using stroke SVG (trademark-safe approximations)
type SvgProps = { size?: number; color?: string; strokeWidth?: number };

const mkBrand = (d: string, filled = false) =>
  function BrandIcon({ size = 20, color = "currentColor", strokeWidth = 1.8 }: SvgProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24"
        fill={filled ? color : "none"}
        stroke={filled ? "none" : color}
        strokeWidth={filled ? 0 : strokeWidth}
        strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    );
  };

const InstagramIcon = mkBrand(
  "M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9A5.5 5.5 0 0 1 16.5 22h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2zm4.5 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm5.5-2.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"
);
const LinkedInIcon = mkBrand(
  "M4.477 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM3 9h3v12H3V9zm5.5 0h2.9v1.65h.04C12.14 9.62 13.52 9 15.22 9c3.24 0 4 1.69 4 3.89V21h-3v-7.34c0-1.75-.73-2.66-1.92-2.66-1.9 0-2.3 1.15-2.3 2.62V21H9V9z"
);
const TwitterXIcon = mkBrand(
  "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
);
const YouTubeIcon = mkBrand(
  "M22.54 6.42A2.78 2.78 0 0 0 20.59 4.46C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.54C5.12 20 12 20 12 20s6.88 0 8.59-.46A2.78 2.78 0 0 0 22.54 17.58 29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"
);
const FacebookIcon = mkBrand(
  "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"
);
const TelegramIcon = mkBrand(
  "M21.73 2.27a1 1 0 0 0-1.09-.22L2.27 9.38a1 1 0 0 0 .07 1.87l4.66 1.56 2 5.75a1 1 0 0 0 1.81.1l2.27-3.9 4.85 3.6a1 1 0 0 0 1.57-.64l2.54-14.46a1 1 0 0 0-.31-.99z"
);

type IconComp = LucideIcon | ((p: SvgProps) => React.ReactElement);

export const FUNNEL_ICON_MAP: Record<string, IconComp> = {
  // Status & checkmarks
  check:          Check,
  "check-circle": CheckCircle,
  "check-square": CheckSquare,
  x:              X,
  "x-circle":     XCircle,
  circle:         Circle,
  "plus-circle":  PlusCircle,
  "minus-circle": MinusCircle,
  // Stars & flair
  star:     Star,
  heart:    Heart,
  crown:    Crown,
  sparkles: Sparkles,
  flame:    Flame,
  diamond:  Diamond,
  thumbsup: ThumbsUp,
  flag:     Flag,
  // Contact & communication
  mail:      Mail,
  phone:     Phone,
  whatsapp:  MessageCircle,
  message:   MessageSquare,
  send:      Send,
  bell:      Bell,
  "at-sign": AtSign,
  // Navigation & location
  home:     Home,
  arrow:    ArrowRight,
  link:     Link,
  location: MapPin,
  globe:    Globe,
  rocket:   Rocket,
  map:      Map,
  // People
  user:  User,
  users: Users,
  smile: Smile,
  // Business
  briefcase:     Briefcase,
  dollar:        DollarSign,
  chart:         BarChart2,
  trending:      TrendingUp,
  award:         Award,
  target:        Target,
  shield:        Shield,
  wallet:        Wallet,
  "cart":        ShoppingCart,
  "credit-card": CreditCard,
  building:      Building2,
  store:         Store,
  package:       Package,
  // Media & devices
  play:        Play,
  camera:      Camera,
  image:       ImageIcon,
  download:    Download,
  headphones:  Headphones,
  mic:         Mic,
  monitor:     Monitor,
  laptop:      Laptop,
  smartphone:  Smartphone,
  tv:          Tv,
  // Time
  clock:    Clock,
  calendar: Calendar,
  // Tech & misc
  lock:      Lock,
  eye:       Eye,
  lightbulb: Lightbulb,
  settings:  Settings,
  search:    Search,
  coffee:    Coffee,
  layers:    Layers,
  zap:       Zap,
  bolt:      Zap, // backward-compat alias
  plus:      Plus,
  minus:     Minus,
  wrench:    Wrench,
  music:     Music,
  leaf:      Leaf,
  code:      Code,
  wifi:      Wifi,
  database:  Database,
  info:      Info,
  // Brand / social
  instagram: InstagramIcon,
  linkedin:  LinkedInIcon,
  twitter:   TwitterXIcon,
  youtube:   YouTubeIcon,
  facebook:  FacebookIcon,
  telegram:  TelegramIcon,
  // Legacy aliases
  dot: Circle,
};

export const FUNNEL_ICON_LIST: string[] = [
  "check","check-circle","check-square","x","x-circle","circle","plus-circle","minus-circle",
  "star","heart","crown","sparkles","flame","diamond","thumbsup","flag",
  "mail","phone","whatsapp","message","send","bell","at-sign",
  "home","arrow","link","location","globe","rocket","map",
  "user","users","smile",
  "briefcase","dollar","chart","trending","award","target","shield",
  "wallet","cart","credit-card","building","store","package",
  "play","camera","image","download","headphones","monitor","laptop","smartphone","tv",
  "clock","calendar",
  "lock","eye","lightbulb","settings","search","coffee","layers",
  "zap","plus","wrench","music","leaf","code","wifi","database","info",
  "instagram","linkedin","twitter","youtube","facebook","telegram",
];

export interface FunnelIconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function FunnelIcon({ name, size = 20, color = "currentColor", strokeWidth = 1.8 }: FunnelIconProps) {
  const Comp = (FUNNEL_ICON_MAP[name] ?? Check) as IconComp;
  return <Comp size={size} color={color} strokeWidth={strokeWidth} />;
}
