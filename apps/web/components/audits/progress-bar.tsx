export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-neutral-soft"
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-success transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
