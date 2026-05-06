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
          ? "bg-[rgba(107,180,74,0.15)] text-[#6BB44A] border border-[rgba(107,180,74,0.3)]"
          : "bg-[var(--wb-surface-hover)] text-[var(--wb-text-tertiary)] border border-[var(--wb-border-subtle)]",
        className,
      ].join(" ")}
    >
      <span
        className={[
          "w-1.5 h-1.5 rounded-full",
          running ? "bg-[#6BB44A] animate-pulse" : "bg-[var(--wb-text-disabled)]",
        ].join(" ")}
      />
      {running ? "Running" : "Stopped"}
    </span>
  );
}
