import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

const CHECKLIST = {
  engineering: {
    title: "Engineering",
    priority: "high" as const,
    items: [
      { id: "sentry", label: "Sentry error monitoring configured" },
      { id: "uptime", label: "Uptime monitoring active (Cronitor/Better Uptime)" },
      { id: "backup", label: "Backup drill completed (Supabase PITR)" },
      { id: "loadtest", label: "Load test passed (p95 within targets)" },
      { id: "security", label: "Security audit complete (pnpm audit clean)" },
      { id: "secrets", label: "All secrets rotated for production" },
      { id: "inngest", label: "Inngest production app registered" },
    ],
  },
  product: {
    title: "Product",
    priority: "high" as const,
    items: [
      { id: "beta", label: "Beta cohort (5-10 customers) run 1-2 audits" },
      { id: "beta-issues", label: "All blocking issues from beta fixed" },
      { id: "legal-pages", label: "Privacy + Terms live at /privacy /terms" },
      { id: "cookie", label: "Cookie consent banner working" },
    ],
  },
  marketing: {
    title: "Marketing",
    priority: "medium" as const,
    items: [
      { id: "ph-draft", label: "ProductHunt draft ready (screenshots uploaded)" },
      { id: "ih-post", label: "IndieHackers post drafted" },
      { id: "launch-day", label: "Launch day scheduled (Tue-Thu)" },
      { id: "npm", label: "npm packages published" },
    ],
  },
  legal: {
    title: "Legal",
    priority: "high" as const,
    items: [
      { id: "privacy", label: "Privacy policy reviewed (Termly + APP 8 section)" },
      { id: "terms", label: "Terms of service live" },
      { id: "soc2", label: "SOC 2 kickoff plan documented" },
    ],
  },
};

const priorityColors = {
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

export default async function LaunchReadinessPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.email !== "sri@visibleau.local") {
    redirect("/dashboard");
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Launch Readiness</h1>
        <p className="text-muted-foreground mt-1">
          Walk through every item before cutting DNS to production.
        </p>
      </div>

      {Object.entries(CHECKLIST).map(([key, section]) => (
        <div key={key} className="border rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${priorityColors[section.priority]}`}
            >
              {section.priority} priority
            </span>
          </div>
          <ul className="space-y-2">
            {section.items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id={item.id}
                  className="h-4 w-4 rounded border-muted"
                  disabled
                />
                <label htmlFor={item.id} className="text-muted-foreground">
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="text-sm text-muted-foreground">
        Status is read-only until all HIGH priority items are verified.
        Walk through <code>docs/golive-checklist.md</code> before cutting DNS.
      </div>
    </div>
  );
}
