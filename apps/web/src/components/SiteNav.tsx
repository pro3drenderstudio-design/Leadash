import Link from "next/link";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/Logo_Icon_Colored.svg" className="w-6 h-6 flex-shrink-0" alt="" />
      <div className="flex flex-col leading-none select-none">
        <span
          className="text-[15px] font-bold tracking-tight text-white/90 group-hover:text-white transition-colors"
          style={{ letterSpacing: "-0.02em" }}
        >
          Leadash
        </span>
        <span className="text-[9px] text-white/30 mt-0.5">by Mizark</span>
      </div>
    </Link>
  );
}

export default function SiteNav() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: "rgba(2,6,23,0.80)",
        backdropFilter: "blur(20px) saturate(180%)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden md:flex items-center gap-7">
            {[
              ["Features",     "/#features"],
              ["How it works", "/#how-it-works"],
              ["Pricing",      "/#pricing"],
              ["About",        "/about"],
            ].map(([label, href]) => (
              <a key={label} href={href} className="text-sm text-white/50 hover:text-white transition-colors">
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-white/50 hover:text-white transition-colors px-3 py-1.5">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-semibold text-white px-5 py-2 rounded-xl transition-all"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", boxShadow: "0 0 20px rgba(249,115,22,0.4)" }}
          >
            Start for free
          </Link>
        </div>
      </div>
    </header>
  );
}
