import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { Footer } from "@/components/domain/landing/footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-16 px-6 flex items-center justify-between border-b sticky top-0 z-50 backdrop-blur-md bg-background/80">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          <Link
            href="/pricing"
            className="hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/methodology"
            className="hover:text-foreground transition-colors"
          >
            Methodology
          </Link>
          <Link
            href="/about"
            className="hover:text-foreground transition-colors"
          >
            About
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="text-sm px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground font-medium"
          >
            Get started
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
