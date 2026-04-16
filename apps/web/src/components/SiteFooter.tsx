import Link from "next/link";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/Logo_Icon_Colored.svg" className="w-6 h-6 flex-shrink-0" alt="" />
      <span
        className="text-[17px] font-bold tracking-tight text-white/90 group-hover:text-white transition-colors select-none"
        style={{ letterSpacing: "-0.02em" }}
      >
        Leadash
      </span>
    </Link>
  );
}

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/6 py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-14">
          {/* Brand */}
          <div className="col-span-2">
            <Logo />
            <p className="text-white/30 text-sm mt-4 leading-relaxed max-w-xs">
              AI-powered cold outreach infrastructure for modern sales teams and agencies.
            </p>
            <div className="flex gap-3 mt-5">
              {/* Twitter/X */}
              <a href="#" className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 text-white/30 hover:text-white/70 hover:border-white/25 transition-all">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              {/* LinkedIn */}
              <a href="#" className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 text-white/30 hover:text-white/70 hover:border-white/25 transition-all">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Link columns */}
          {[
            { heading: "Product", links: [
              { label: "Features",     href: "/#features"     },
              { label: "How it works", href: "/#how-it-works" },
              { label: "Pricing",      href: "/#pricing"      },
            ]},
            { heading: "Company", links: [
              { label: "About",   href: "/about"   },
              { label: "Contact", href: "/contact" },
            ]},
            { heading: "Legal", links: [
              { label: "Privacy Policy",   href: "/privacy"      },
              { label: "Terms of Service", href: "/terms"         },
              { label: "GDPR",             href: "/privacy#gdpr"  },
            ]},
          ].map(col => (
            <div key={col.heading}>
              <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4">{col.heading}</p>
              <div className="space-y-2.5">
                {col.links.map(l => (
                  <a key={l.label} href={l.href} className="block text-white/30 text-sm hover:text-white/70 transition-colors">{l.label}</a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/6 gap-4">
          <p className="text-white/20 text-sm">© {new Date().getFullYear()} Leadash. All rights reserved.</p>
          <div className="flex items-center gap-6">
            {[["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"], ["GDPR", "/privacy#gdpr"]].map(([l, href]) => (
              <a key={l} href={href} className="text-white/20 text-sm hover:text-white/50 transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
