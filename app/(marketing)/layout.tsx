export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <span className="text-lg font-semibold">VisibleAU</span>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/sample-audit" className="hover:underline">
              Free audit
            </a>
            <a href="/pricing" className="hover:underline">
              Pricing
            </a>
            <a href="/sign-in" className="hover:underline">
              Sign in
            </a>
            <a
              href="/sign-up"
              className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm"
            >
              Get started
            </a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
