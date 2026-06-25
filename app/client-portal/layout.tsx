export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header - no sidebar */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center">
          <span className="text-lg font-semibold tracking-tight">VisibleAU</span>
          <span className="ml-3 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Client Portal
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
