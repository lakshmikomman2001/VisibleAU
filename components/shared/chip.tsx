/**
 * S02 part 4 (contract component Chip, variant "fact"; docs/prototypes/token-map.md row "Chip": "Add Chip ... to
 * components/shared"): a fact about a thing, "Service: Plumbing". Height 24, padding 0 10, radius 999, fill --bg-subtle
 * (contract --surface-2), border --border-default; the key in --text-secondary, the value 600 in --text-primary. The
 * removable, selectable and star variants come with the screens that need them (S03 on).
 */
export function Chip({ name, value }: { name: string; value: string }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap"
      style={{
        height: 24,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: 12,
        boxSizing: "border-box",
        background: "var(--bg-subtle)",
        border: "1px solid var(--border-default)",
        color: "var(--text-secondary)",
      }}
    >
      {name}:&nbsp;<span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{value}</span>
    </span>
  );
}
