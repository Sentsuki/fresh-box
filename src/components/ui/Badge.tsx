interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "accent" | "success" | "warning" | "error" | "subtle";
  className?: string;
}

const variantClasses = {
  default:
    "bg-[var(--wb-surface-hover)] text-[var(--wb-text-secondary)] border border-[var(--wb-border-subtle)]",
  accent:
    "bg-[rgba(96,205,255,0.15)] text-[var(--wb-accent)] border border-[rgba(96,205,255,0.3)]",
  success:
    "bg-[var(--wb-success-bg)] text-[var(--wb-success)] border border-[var(--wb-success-border)]",
  warning:
    "bg-[var(--wb-warning-bg)] text-[var(--wb-warning)] border border-[var(--wb-warning-border)]",
  error:
    "bg-[var(--wb-error-bg)] text-[var(--wb-error)] border border-[var(--wb-error-border)]",
  subtle:
    "bg-transparent text-[var(--wb-text-tertiary)] border border-[var(--wb-border-subtle)]",
};

export function Badge({
  children,
  variant = "default",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium rounded-[var(--wb-radius-sm)] leading-tight",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
