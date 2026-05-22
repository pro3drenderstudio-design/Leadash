import type { ReactNode } from "react";
import VendorNav from "@/components/VendorNav";

export const dynamic = "force-dynamic";

export default function VendorLayout({ children }: { children: ReactNode }) {
  return <VendorNav>{children}</VendorNav>;
}
