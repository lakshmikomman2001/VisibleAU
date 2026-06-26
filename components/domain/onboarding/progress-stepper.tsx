export function ProgressStepper({
  currentStep,
}: {
  currentStep: 1 | 2 | 3 | 4;
}) {
  const steps = ["Add brand", "Configure", "Run audit", "See results"];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            className={`flex items-center gap-1 text-xs ${
              i < currentStep
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${
                i < currentStep
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {i + 1}
            </span>
            <span>{s}</span>
          </div>
          {i < steps.length - 1 && (
            <span className="mx-1 text-muted-foreground text-xs">
              &rarr;
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
