import { CONTACT_EMAIL, LEGAL_ABN, LEGAL_ENTITY_NAME } from "@/lib/product";

export function Footer() {
  return (
    <footer className="border-t py-8 mt-16">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        {/* 11 Nov (Sri): "Vunnara · ABN 35 523 139 837", from lib/product.ts's constants. */}
        <span>
          &copy; {new Date().getFullYear()} {LEGAL_ENTITY_NAME} · ABN {LEGAL_ABN}
        </span>
        <nav className="flex gap-6">
          <a href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </a>
          <a href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </a>
          <a href="/methodology" className="hover:text-foreground transition-colors">
            Methodology
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground transition-colors">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
