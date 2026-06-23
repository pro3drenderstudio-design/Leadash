/**
 * Auth layout — quiet wrapper now that pages bring their own AuthShell.
 *
 * The previous gradient orbs + grid have moved out — the new AuthShell
 * paints its own dot-grid into the brand panel. This layout just imports
 * the v2-app token sheet and keeps the canvas dark.
 */

import "@/v2-app/v2-app.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#07070A", minHeight: "100vh" }}>
      {children}
    </div>
  );
}
