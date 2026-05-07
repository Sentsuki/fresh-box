interface StatusBadgeProps {
  running: boolean;
  className?: string;
  showLabel?: boolean;
}

export function StatusBadge({ running, className = "", showLabel = true }: StatusBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center justify-center gap-1.5 py-0.5 text-xs font-medium rounded-full",
        showLabel ? "px-2" : "w-6 h-6",
        running
          ? "bg-(--wb-success-bg) text-(--wb-success) border border-(--wb-success-border)"
          : "bg-(--wb-surface-hover) text-(--wb-text-tertiary) border border-(--wb-border-subtle)",
        className,
      ].join(" ")}
      title={!showLabel ? (running ? "Running" : "Stopped") : undefined}
    >
      <span
        className={[
          "w-1.5 h-1.5 rounded-full flex-shrink-0",
          running ? "bg-(--wb-success) animate-pulse" : "bg-(--wb-text-disabled)",
        ].join(" ")}
      />
      {showLabel && <span>{running ? "Running" : "Stopped"}</span>}
    </span>
  );
}
