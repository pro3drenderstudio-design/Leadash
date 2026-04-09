export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">Leadash</h1>
          <p className="text-gray-400 text-sm mt-1">Cold outreach, at scale</p>
        </div>
        {children}
      </div>
    </div>
  );
}
