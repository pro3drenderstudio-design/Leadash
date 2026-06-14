import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import { CurrencyProvider } from "@/lib/currency";
import { getCurrencyContext } from "@/lib/currency/server";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Resolve currency on the marketing pages too so the public pricing block
  // shows local prices for non-Nigerian visitors out of the box.
  const currencyContext = await getCurrencyContext();
  return (
    <CurrencyProvider context={currencyContext}>
      <div className="min-h-screen flex flex-col" style={{ background: "#020617" }}>
        <SiteNav />
        <div className="pt-16 flex-1">
          {children}
        </div>
        <SiteFooter />
      </div>
    </CurrencyProvider>
  );
}
