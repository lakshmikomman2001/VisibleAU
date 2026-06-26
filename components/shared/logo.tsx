export function Logo({ className }: { className?: string }) {
  return (
    <span className={`font-bold text-lg tracking-tight ${className ?? ""}`}>
      Visible<span className="text-primary">AU</span>
    </span>
  );
}
