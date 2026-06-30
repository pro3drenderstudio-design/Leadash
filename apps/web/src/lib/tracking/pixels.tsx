"use client";
import { useEffect, useRef } from "react";

export interface FunnelTracking {
  meta_pixel_id?: string;
  ga4_measurement_id?: string;
  google_ads_conversion_id?: string;
  google_ads_conversion_label?: string;
  gtm_container_id?: string;
}

type PlainFn = (...args: unknown[]) => void;
type FbqQueueFn = PlainFn & {
  callMethod?: PlainFn;
  queue?: unknown[][];
  push?: PlainFn;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: PlainFn;
    gtag?: PlainFn;
    dataLayer?: unknown[];
  }
}

function ensureFbq(): PlainFn {
  if (window.fbq) return window.fbq;
  const fbq: FbqQueueFn = (...args: unknown[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue!.push(args);
  };
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  window.fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  const firstScript = document.getElementsByTagName("script")[0];
  firstScript?.parentNode?.insertBefore(script, firstScript);

  return fbq;
}

function ensureGtag(firstId: string) {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => { window.dataLayer!.push(args); };

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(firstId)}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
}

function loadGtm(containerId: string) {
  if (document.getElementById(`ld-gtm-${containerId}`)) return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.id = `ld-gtm-${containerId}`;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  document.head.appendChild(script);
}

/** Mounts whichever pixel scripts are configured and fires the page-view event once. No-op when `tracking` is empty or `enabled` is false (e.g. admin preview). */
export function TrackingPixels({ tracking, enabled = true }: { tracking: FunnelTracking | null | undefined; enabled?: boolean }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tracking || firedRef.current) return;
    firedRef.current = true;

    if (tracking.meta_pixel_id) {
      const fbq = ensureFbq();
      fbq("init", tracking.meta_pixel_id);
      fbq("track", "PageView");
    }

    const googleIds = [tracking.ga4_measurement_id, tracking.google_ads_conversion_id].filter((v): v is string => Boolean(v));
    if (googleIds.length > 0) {
      ensureGtag(googleIds[0]);
      for (const id of googleIds) window.gtag?.("config", id);
    }

    if (tracking.gtm_container_id) loadGtm(tracking.gtm_container_id);
  }, [tracking, enabled]);

  return null;
}

export function trackLead(tracking: FunnelTracking | null | undefined) {
  if (!tracking) return;
  if (tracking.meta_pixel_id) window.fbq?.("track", "Lead");
  if (tracking.ga4_measurement_id) window.gtag?.("event", "generate_lead");
  if (tracking.gtm_container_id) { window.dataLayer = window.dataLayer ?? []; window.dataLayer.push({ event: "lead" }); }
}

export function trackPurchase(tracking: FunnelTracking | null | undefined, opts: { value: number; currency: string; orderId: string }) {
  if (!tracking) return;

  if (tracking.meta_pixel_id) {
    window.fbq?.("track", "Purchase", { value: opts.value, currency: opts.currency });
  }
  if (tracking.ga4_measurement_id) {
    window.gtag?.("event", "purchase", { transaction_id: opts.orderId, value: opts.value, currency: opts.currency });
  }
  if (tracking.google_ads_conversion_id) {
    const sendTo = tracking.google_ads_conversion_label
      ? `${tracking.google_ads_conversion_id}/${tracking.google_ads_conversion_label}`
      : tracking.google_ads_conversion_id;
    window.gtag?.("event", "conversion", { send_to: sendTo, value: opts.value, currency: opts.currency, transaction_id: opts.orderId });
  }
  if (tracking.gtm_container_id) {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ event: "purchase", value: opts.value, currency: opts.currency, transaction_id: opts.orderId });
  }
}
