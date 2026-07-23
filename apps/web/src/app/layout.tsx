import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import Script from "next/script";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Leadash — Cold outreach at scale",
  description: "Send personalized cold emails at scale with inbox warmup, AI reply detection, and deep analytics.",
  icons: {
    icon:  [{ url: "/Logo_Icon_Colored.svg", type: "image/svg+xml" }],
    apple: [{ url: "/Logo_Icon_Colored.svg" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The app shell (.v2-app) is dark-only — light mode has no shell tokens
            and renders a broken hybrid on devices that had a stale 'light'
            preference. Force dark before paint and clear any stale light. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(localStorage.getItem('ld-theme')==='light')localStorage.removeItem('ld-theme');}catch(e){}document.documentElement.classList.add('dark');})()` }} />
      </head>
      <body className={`${geist.className} antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
        {/* Microsoft Clarity */}
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window,document,"clarity","script","x2y3p7iatg");`}
        </Script>
      </body>
    </html>
  );
}
