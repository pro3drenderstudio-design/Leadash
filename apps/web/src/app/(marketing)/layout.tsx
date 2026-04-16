import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#020617" }}>
      <SiteNav />
      <div className="pt-16 flex-1">
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
