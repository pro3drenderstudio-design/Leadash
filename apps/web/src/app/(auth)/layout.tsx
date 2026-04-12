export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#07070f] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-blue-700/10 blur-[130px]" />
        <div className="absolute bottom-[-5%] right-[15%] w-[450px] h-[350px] rounded-full bg-violet-700/8 blur-[110px]" />
        <div className="absolute top-[40%] left-[5%] w-[300px] h-[300px] rounded-full bg-blue-500/5 blur-[90px]" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="w-full max-w-[400px] relative z-10">
        {/* Logo */}
        <div className="flex justify-center mb-9">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Leadash" className="h-10 w-auto" />
        </div>
        {children}
      </div>
    </div>
  );
}
