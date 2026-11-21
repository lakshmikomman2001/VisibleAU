"use client";

import { Info, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LogoUploader } from "@/components/domain/branding/logo-uploader";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { BusinessKindPicker } from "@/components/domain/vertical/business-kind-picker";
import { PromptPreview } from "@/components/domain/vertical/prompt-preview";
import { suggestAliases } from "@/lib/brands/aliases";
import { VERTICAL_LABELS } from "@/lib/brands/business-label";
import { MAX_COMPARISON_COMPETITORS, withCompetitorAdded } from "@/lib/brands/competitor-limits";
import { isRunTogetherDomainName, readableNameFromDomain } from "@/lib/brands/name-from-domain";
import type { AuStateCode } from "@/lib/constants/au";
import { AU_STATES } from "@/lib/constants/au";
import { isValidSuburbEntry, resolveCityForSuburb } from "@/lib/locations";
import { type Breadcrumbs, CRUMB } from "@/lib/navigation/breadcrumbs";

/** One array for every render, so the breadcrumb isn't reset on each keystroke. */
const WIZARD_CRUMBS: Breadcrumbs = [CRUMB.workspace, CRUMB.brands, { label: "Add brand" }];

interface AuditConfig {
  freeEngines: number;
  freeRuns: number;
  paidEngines: number;
  paidRuns: number;
  promptsPerAudit: number;
}

export function WizardForm({ auditConfig }: { auditConfig: AuditConfig }) {
  const { freeEngines, freeRuns, paidEngines, paidRuns, promptsPerAudit } = auditConfig;
  const freeCalls = freeEngines * promptsPerAudit * freeRuns;
  const paidCalls = paidEngines * promptsPerAudit * paidRuns;

  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  // 13 Nov (part 2): the name the wizard suggested from the domain, while the owner hasn't changed it, and
  // whether they chose to keep a run-together domain label as the name.
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  // S00 part 4 (LLD 8.8.2): the name the business's own site gives (og:site_name, its title, JSON-LD), asked for
  // when the domain is entered; null while there's none (the domain's words above are the suggestion then).
  const [siteSuggestion, setSiteSuggestion] = useState<string | null>(null);
  const [keepRunTogether, setKeepRunTogether] = useState(false);
  const runTogether = isRunTogetherDomainName(name, domain) && !keepRunTogether;
  // The other names saved with the brand, shown under the name so none is added silently.
  const aliasesToSave = name.trim() && domain.trim() ? suggestAliases(name, domain) : [];
  const onDomainChange = (value: string) => {
    setDomain(value);
    setSiteSuggestion(null);
    // Suggest a readable name where the domain shows the words ("hero-home-services" -> "Hero Home
    // Services"), only while the name is empty or still the wizard's own suggestion.
    if (name === "" || name === suggestedName) {
      const readable = readableNameFromDomain(value);
      setSuggestedName(readable);
      setName(readable ?? "");
    }
  };
  // What the fields hold now, for an answer that arrives after the owner has typed on.
  const latest = useRef({ name, domain, suggestedName });
  latest.current = { name, domain, suggestedName };
  /** The site's own name for the domain just entered; it replaces the name only while that is still a suggestion. */
  const askSiteForName = async () => {
    const host = domain.trim();
    if (!host.includes(".")) return;
    try {
      const res = await fetch(`/api/brands/name-suggestion?domain=${encodeURIComponent(host)}`);
      if (!res.ok) return;
      const body = (await res.json()) as { name: string | null; source: string | null };
      if (!body.name || body.source === "domain") return;
      const now = latest.current;
      if (now.domain.trim() !== host) return;
      setSiteSuggestion(body.name);
      if (now.name === "" || now.name === now.suggestedName) {
        setSuggestedName(body.name);
        setName(body.name);
      }
    } catch {
      // No suggestion: the owner types the name, as before.
    }
  };
  const [vertical, setVertical] = useState("");
  const [suburbs, setSuburbs] = useState<string[]>([]);
  const [suburbInput, setSuburbInput] = useState("");
  // 13 Nov (part 8): the first suburb's postcode, where Google's AI answers are checked from (optional).
  const [postcode, setPostcode] = useState("");
  const postcodeValid = postcode.trim() === "" || /^\d{4}$/.test(postcode.trim());
  const [selectedState, setSelectedState] = useState<AuStateCode>("NSW");
  const [suburbError, setSuburbError] = useState("");
  // Vunnara Build 1, Part D: location is required -- either at least
  // one confirmed suburb, or an explicit "no fixed location" choice.
  // There is no silent default any more.
  const [isOnlineOnly, setIsOnlineOnly] = useState(false);
  const [competitorInput, setCompetitorInput] = useState("");
  const [competitors, setCompetitors] = useState<string[]>([]);
  // 2 Nov: the brand's own logo, uploaded in step 1 (owners and admins);
  // saved on the brand when it's created.
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const addSuburb = () => {
    setSuburbError("");
    const v = suburbInput.trim();
    if (!v) return;
    if (!/^[A-Za-z][A-Za-z\s]{0,49}$/.test(v)) {
      setSuburbError("Letters and spaces only");
      return;
    }
    const entry = `${selectedState}:${v}`;
    if (!isValidSuburbEntry(entry)) {
      setSuburbError("Invalid suburb format");
      return;
    }
    if (suburbs.includes(entry)) {
      setSuburbError("Already added");
      return;
    }
    if (suburbs.length >= 3) return;
    setSuburbs([...suburbs, entry]);
    setSuburbInput("");
  };

  const addCompetitor = () => {
    // 13 Nov (part 2): the same rule as Brand settings (lib/brands/competitor-limits.ts).
    const added = withCompetitorAdded(competitors, competitorInput);
    if (added.error) return;
    setCompetitors(added.list);
    setCompetitorInput("");
  };

  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      // Vunnara Build 1, Part D: no silent "NSW:Sydney CBD" fallback --
      // canContinue (below) already guarantees either isOnlineOnly or
      // at least one real suburb by the time this runs. suburb/city/
      // state/country describe the PRIMARY (first) confirmed location;
      // primaryRegions keeps the full list (up to 3) for broader use.
      // city comes from the curated lib/locations list when the typed
      // suburb matches one exactly (case-insensitive) -- never a
      // geocoded guess; otherwise city is NULL (unknown), never the
      // suburb name itself (hotfix, 18 Oct, post-df27ef8 -- that
      // fallback invented a fact; NULL is the honest "we don't know").
      const firstSuburbEntry = suburbs[0];
      const [firstState, ...firstSuburbNameParts] = firstSuburbEntry?.split(":") ?? [];
      const firstSuburbName = firstSuburbNameParts.join(":");

      const brandRes = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          // S00 part 4: the other names shown under the name, and the site's suggestion (brand settings says
          // "Suggested from your website's name" while the name still equals it).
          aliases: aliasesToSave,
          nameSuggestion: siteSuggestion,
          domain: domain.replace(/^(https?:\/\/)?/i, "").replace(/^www\./i, ""),
          vertical,
          primaryRegions: isOnlineOnly ? [] : suburbs,
          competitors,
          ...(logoUrl ? { logoUrl } : {}),
          locationMode: isOnlineOnly ? "online_only" : "fixed",
          ...(isOnlineOnly
            ? {}
            : {
                suburb: firstSuburbName,
                city: firstSuburbEntry ? resolveCityForSuburb(firstSuburbEntry) : null,
                state: firstState,
                postcode: postcode.trim() || null,
                country: "Australia",
              }),
        }),
      });
      if (!brandRes.ok) {
        const data = await brandRes.json();
        setError(typeof data.error === "string" ? data.error : "Failed to create brand");
        setLoading(false);
        return;
      }
      const brandData = await brandRes.json();
      const brandId = brandData.brand?.id;
      if (brandId) {
        // 16 Nov, part 5: the brand page, where the owner confirms what the business does -- its first audit starts
        // from there (ClassificationConfirmCard startFirstAudit). Started here, before confirmation, it always failed
        // (POST /api/audits refuses a brand that still needs confirming), so every wizard ended on that error. The
        // refresh after the push: the shell's "New brand" counts this brand now.
        router.push(`/brands/${brandId}`);
        router.refresh();
        return;
      }
      router.push("/brands");
      router.refresh();
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 36,
    padding: "0 12px",
    borderRadius: 6,
    fontSize: 14,
    background: "var(--bg-base)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
    outline: "none",
  };

  const btnPrimary: React.CSSProperties = {
    height: 36,
    padding: "0 16px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    background: "var(--accent-primary)",
    color: "var(--accent-primary-fg)",
    border: "none",
    cursor: "pointer",
  };
  const btnSecondary: React.CSSProperties = {
    height: 36,
    padding: "0 16px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)",
    cursor: "pointer",
  };

  const canContinue =
    step === 1
      ? name && domain && !runTogether
      : step === 2
        ? !!vertical
        : step === 3
          ? isOnlineOnly || (suburbs.length > 0 && postcodeValid)
          : true;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={WIZARD_CRUMBS} />

      {/* Page h1 */}
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          margin: "0 0 4px",
        }}
      >
        Add a brand
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 24px" }}>
        {`Step ${step} of 4 · ~3 minutes total`}
      </p>

      {/* Progress bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 9999,
              background: s <= step ? "var(--accent-blue)" : "var(--bg-subtle)",
              transition: "background 0.2s ease",
            }}
          />
        ))}
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 6,
            fontSize: 13,
            background: "var(--danger-soft)",
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* Card wrapper */}
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          padding: 24,
          marginBottom: 16,
        }}
      >
        {/* ═══ STEP 1: Brand basics ═══ */}
        {step === 1 && (
          <div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 20,
              }}
            >
              Brand basics
            </h2>

            {/* Brand name */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="wiz-name"
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Brand name
              </label>
              <input
                id="wiz-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setKeepRunTogether(false);
                }}
                placeholder="Your business name"
                style={inputStyle}
              />
              {suggestedName && name === suggestedName && (
                <p
                  data-name-suggested={siteSuggestion === suggestedName ? "site" : ""}
                  style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "6px 0 0" }}
                >
                  {siteSuggestion === suggestedName
                    ? "Suggested from your website's name. Edit if it's different."
                    : "From your web address. Change it if customers write it differently."}
                </p>
              )}
              {aliasesToSave.length > 0 && (
                <p
                  data-name-aliases=""
                  style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "6px 0 0" }}
                >
                  {`Also recognised as ${aliasesToSave.join(" and ")} in AI answers. You can change these in Brand settings.`}
                </p>
              )}
              {runTogether && (
                <div
                  role="alert"
                  data-name-run-together=""
                  style={{
                    marginTop: 8,
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: "var(--warning-soft)",
                    border: "1px solid var(--warning)",
                    fontSize: 12,
                    color: "var(--text-primary)",
                  }}
                >
                  &ldquo;{name}&rdquo; is your web address without its spaces. Write the name the
                  way customers see it (for example with spaces between the words) &mdash; it&apos;s
                  the name your audit&apos;s questions and pages use.{" "}
                  <button
                    type="button"
                    onClick={() => setKeepRunTogether(true)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "var(--accent-primary)",
                      textDecoration: "underline",
                      fontSize: 12,
                    }}
                  >
                    Keep &ldquo;{name}&rdquo;
                  </button>
                </div>
              )}
            </div>

            {/* Domain with https:// prefix */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="wiz-domain"
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Domain
              </label>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span
                  style={{
                    height: 36,
                    padding: "0 10px",
                    display: "flex",
                    alignItems: "center",
                    fontSize: 13,
                    color: "var(--text-tertiary)",
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-default)",
                    borderRight: "none",
                    borderRadius: "6px 0 0 6px",
                  }}
                >
                  https://
                </span>
                <input
                  id="wiz-domain"
                  value={domain}
                  onChange={(e) => onDomainChange(e.target.value)}
                  onBlur={() => void askSiteForName()}
                  placeholder="example.com.au"
                  style={{ ...inputStyle, borderRadius: "0 6px 6px 0" }}
                />
              </div>
            </div>

            {/* 2 Nov: the brand's logo. "Upload instead" was a span with no
                handler, beside "Logo auto-detected from favicon.ico" --
                nothing was ever fetched or stored; the tile was the
                browser's own try at https://<domain>/favicon.ico, and the
                initials meant that failed. Now: no logo until one is
                uploaded, and the initials are only a placeholder. */}
            {domain && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 6,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-subtle)",
                  marginBottom: 16,
                }}
              >
                <LogoUploader
                  value={logoUrl}
                  onChange={setLogoUrl}
                  initials={
                    domain
                      .replace(/^(https?:\/\/)?/i, "")
                      .replace(/^www\./i, "")
                      .split(".")[0]
                      .slice(0, 2)
                      .toUpperCase() || "??"
                  }
                  owner="the brand"
                  purpose="brand"
                />
              </div>
            )}

            {/* Region select */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Region
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {/* 17 Nov, part 2: only the regions we audit -- no greyed New Zealand / United Kingdom
                    "Coming soon". */}
                {[{ value: "au", label: "Australia", enabled: true }].map((r) => (
                  <div
                    key={r.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 6,
                      border:
                        r.value === "au"
                          ? "1px solid var(--accent-blue)"
                          : "1px solid var(--border-default)",
                      background: r.value === "au" ? "var(--accent-blue-soft)" : "transparent",
                      opacity: r.enabled ? 1 : 0.4,
                      cursor: r.enabled ? "pointer" : "not-allowed",
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        border:
                          r.value === "au"
                            ? "4px solid var(--accent-blue)"
                            : "1px solid var(--border-strong)",
                        background: r.value === "au" ? "var(--accent-blue)" : "transparent",
                      }}
                    />
                    <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{r.label}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                We use your region to choose the questions and directories we check.
              </p>
            </div>
          </div>
        )}

        {/* ═══ STEP 2: What kind of business (16 Nov, part 4) ═══ */}
        {step === 2 && (
          <div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              What kind of business?
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
              Pick the closest match. After you add the brand, you&apos;ll confirm exactly what it
              does, and its questions are written for that.
            </p>
            <BusinessKindPicker value={vertical} onChange={setVertical} />
            {vertical && <PromptPreview vertical={vertical} primaryRegion={suburbs[0] ?? ""} />}
          </div>
        )}

        {/* ═══ STEP 3: Locations & competitors ═══ */}
        {step === 3 && (
          <div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 20,
              }}
            >
              Locations &amp; competitors
            </h2>

            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Primary suburbs (up to 3)
              </label>
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "0 0 10px" }}>
                Required: we use it in the questions we ask AI and in your reports. If you
                don&apos;t have a fixed location, say so instead.
              </p>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                  cursor: "pointer",
                  fontSize: 13,
                  color: "var(--text-primary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={isOnlineOnly}
                  onChange={(e) => {
                    setIsOnlineOnly(e.target.checked);
                    setSuburbError("");
                  }}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                No fixed location — we operate online only
              </label>
              {isOnlineOnly && (
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "0 0 4px" }}>
                  We&apos;ll skip questions about a location and won&apos;t guess a city for you.
                </p>
              )}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 8,
                  opacity: isOnlineOnly ? 0.4 : 1,
                }}
              >
                {suburbs.map((s) => {
                  const [stateCode, ...rest] = s.split(":");
                  const suburb = rest.join(":");
                  return (
                    <span
                      key={s}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 10px",
                        borderRadius: 9999,
                        fontSize: 12,
                        background: "var(--accent-muted)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {suburb}, {stateCode}
                      <button
                        type="button"
                        aria-label={`Remove ${suburb}, ${stateCode}`}
                        onClick={() => setSuburbs(suburbs.filter((x) => x !== s))}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          color: "var(--text-tertiary)",
                          display: "flex",
                        }}
                      >
                        <X style={{ width: 12, height: 12 }} />
                      </button>
                    </span>
                  );
                })}
              </div>
              {!isOnlineOnly &&
                (suburbs.length < 3 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <select
                      aria-label="State or territory"
                      value={selectedState}
                      onChange={(e) => setSelectedState(e.target.value as AuStateCode)}
                      style={{
                        ...inputStyle,
                        width: "auto",
                        minWidth: 80,
                        flex: "0 0 auto",
                        cursor: "pointer",
                      }}
                    >
                      {AU_STATES.map((st) => (
                        <option key={st.code} value={st.code}>
                          {st.code}
                        </option>
                      ))}
                    </select>
                    <input
                      value={suburbInput}
                      onChange={(e) => {
                        setSuburbInput(e.target.value);
                        setSuburbError("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSuburb())}
                      placeholder="e.g. Bondi"
                      style={{ ...inputStyle, flex: "1 1 120px", minWidth: 120 }}
                    />
                    <button
                      type="button"
                      onClick={addSuburb}
                      style={{ ...btnSecondary, flexShrink: 0 }}
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
                    Maximum 3 suburbs reached. Remove one to add another.
                  </p>
                ))}
              {!isOnlineOnly && suburbError && (
                <p style={{ fontSize: 11, color: "var(--danger)", margin: "4px 0 0" }}>
                  {suburbError}
                </p>
              )}
              {!isOnlineOnly && suburbs.length === 0 && (
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
                  Add at least one suburb to continue, or tick &quot;no fixed location&quot; above.
                </p>
              )}
              {!isOnlineOnly && suburbs.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <label
                    htmlFor="wiz-postcode"
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    Postcode of {suburbs[0].split(":").slice(1).join(":")} (optional)
                  </label>
                  <input
                    id="wiz-postcode"
                    inputMode="numeric"
                    maxLength={4}
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    style={{ ...inputStyle, width: 96 }}
                  />
                  <p
                    style={{
                      fontSize: 11,
                      color: postcodeValid ? "var(--text-tertiary)" : "var(--danger)",
                      margin: "4px 0 0",
                    }}
                  >
                    {postcodeValid
                      ? "Where we check Google's AI answers from; without it, Google is checked for the nearest place it lists."
                      : "An Australian postcode is four digits."}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Add competitor (optional)
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {competitors.map((c) => (
                  <span
                    key={c}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 10px",
                      borderRadius: 9999,
                      fontSize: 12,
                      background: "var(--accent-muted)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => setCompetitors(competitors.filter((x) => x !== c))}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        color: "var(--text-tertiary)",
                        display: "flex",
                      }}
                    >
                      <X style={{ width: 12, height: 12 }} />
                    </button>
                  </span>
                ))}
              </div>
              {competitors.length < MAX_COMPARISON_COMPETITORS ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={competitorInput}
                    onChange={(e) => setCompetitorInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCompetitor())}
                    placeholder="A competitor's name"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={addCompetitor}
                    style={{ ...btnSecondary, flexShrink: 0 }}
                  >
                    Add
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
                  Maximum {MAX_COMPARISON_COMPETITORS} competitors reached. Remove one to add
                  another.
                </p>
              )}
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                We&apos;ll detect when LLMs mention them alongside you.
              </p>
            </div>
          </div>
        )}

        {/* ═══ STEP 4: Confirm & first audit ═══ */}
        {step === 4 && (
          <div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 20,
              }}
            >
              Confirm &amp; run first audit
            </h2>

            {/* Summary box */}
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                background: "var(--bg-subtle)",
                marginBottom: 16,
              }}
            >
              {[
                { label: "Brand", value: name },
                { label: "Domain", value: domain },
                { label: "Logo", value: logoUrl ? "Uploaded" : "None yet" },
                { label: "Business", value: VERTICAL_LABELS[vertical] ?? vertical },
                {
                  label: "Locations",
                  value: isOnlineOnly
                    ? "Online only (no fixed location)"
                    : suburbs
                        .map((s) => {
                          const [st, ...rest] = s.split(":");
                          return `${rest.join(":")}, ${st}`;
                        })
                        .join("; "),
                },
                ...(competitors.length > 0
                  ? [{ label: "Competitors", value: competitors.join(", ") }]
                  : []),
                // Price corrections (25 Oct): was a hard-coded "~A$0.50–0.80 /
                // ~A$2–4" estimate -- it implied a per-audit charge customers
                // don't pay, and real audits cost the business more (audit #36:
                // A$3.52). No numbers here.
                { label: "Cost", value: "Audits are included in your plan" },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border-subtle)",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "var(--text-tertiary)" }}>{row.label}</span>
                  <span
                    style={{
                      color: "var(--text-primary)",
                      fontWeight: 500,
                      textAlign: "right",
                      maxWidth: "60%",
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Info box */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "12px 16px",
                borderRadius: 8,
                background: "var(--accent-blue-soft)",
                marginBottom: 8,
              }}
            >
              <Info
                style={{
                  width: 16,
                  height: 16,
                  color: "var(--accent-blue)",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              />
              <p
                style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}
              >
                {
                  // Vunnara Build 1, Part F.2: "answers", never "calls" --
                  // every run after the first used to replay a cached
                  // response, never an independent sample (Part F.1 now
                  // runs each question once, so runWord/paidRuns/
                  // freeRuns are always "1 run" and no longer worth
                  // spelling out). "{N}+" because Part E's branded
                  // extras (a couple of extra "X vs Y"/"alternatives to"
                  // questions on top of the {promptsPerAudit} organic
                  // ones) aren't known until the brand's classification
                  // and competitors are confirmed, after this estimate.
                  `Your first audit will run on your tier's engines. Paid: ${paidEngines} engines × ${promptsPerAudit} questions = ${paidCalls}+ answers (~3–5 min). Free: ${freeEngines} engines × ${promptsPerAudit} questions = ${freeCalls}+ answers (~1–2 min).`
                }
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep(step - 1)}
          style={{
            ...btnSecondary,
            opacity: step === 1 ? 0.4 : 1,
            cursor: step === 1 ? "not-allowed" : "pointer",
          }}
        >
          Back
        </button>
        {step < 4 ? (
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => setStep(step + 1)}
            style={{
              ...btnPrimary,
              opacity: canContinue ? 1 : 0.5,
              cursor: canContinue ? "pointer" : "not-allowed",
            }}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={handleSubmit}
            style={{
              ...btnPrimary,
              opacity: loading ? 0.5 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating..." : "Create brand & run first audit"}
          </button>
        )}
      </div>
    </div>
  );
}
