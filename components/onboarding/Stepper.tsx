const STEPS = ["Couple", "Date", "Cover photo"];

/** Three bars: finished steps in champagne, the current one in plum. */
export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="mb-8" role="group" aria-label={`Step ${current} of 3`}>
      <div className="mb-2 grid grid-cols-3 gap-3">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`h-1.5 rounded-full ${
              i + 1 < current ? "bg-champagne" : i + 1 === current ? "bg-plum" : "bg-border"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 text-[11px]">
        {STEPS.map((label, i) => {
          const done = i + 1 < current;
          return (
            <span
              key={label}
              className={
                done
                  ? "font-medium text-champagne-deep"
                  : i + 1 === current
                    ? "font-medium text-plum"
                    : "text-ink-secondary"
              }
            >
              {label}
              {done && " · Done"}
            </span>
          );
        })}
      </div>
    </div>
  );
}
