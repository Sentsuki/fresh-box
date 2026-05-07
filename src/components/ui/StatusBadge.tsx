interface StatusBadgeProps {
  running: boolean;
  className?: string;
}

export function StatusBadge({ running, className = "" }: StatusBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full",
        running
          ? "bg-(--wb-success-bg) text-(--wb-success) border border-(--wb-success-border)"
          : "bg-(--wb-surface-hover) text-(--wb-text-tertiary) border border-(--wb-border-subtle)",
        className,
      ].join(" ")}
    >
      <span
        className={[
          "w-1.5 h-1.5 rounded-full",
          running ? "bg-(--wb-success) animate-pulse" : "bg-(--wb-text-disabled)",
        ].join(" ")}
      />
      {running ? "Running" : "Stopped"}
    </span>
  );
}
