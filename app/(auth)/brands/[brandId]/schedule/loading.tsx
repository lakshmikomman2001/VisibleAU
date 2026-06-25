export default function ScheduleLoading() {
  return (
    <div className="p-8 space-y-6">
      <div className="h-8 w-48 rounded bg-muted animate-pulse" />
      <div className="rounded-lg border bg-card p-6 max-w-lg space-y-4">
        <div className="h-4 w-64 rounded bg-muted animate-pulse" />
        <div className="h-4 w-40 rounded bg-muted animate-pulse" />
        <div className="h-10 w-32 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}
