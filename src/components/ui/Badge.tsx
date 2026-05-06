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
    "bg-[rgba(107,180,74,0.15)] text-[#6BB44A] border border-[rgba(107,180,74,0.3)]",
  warning:
    "bg-[rgba(255,200,0,0.15)] text-[#FFD700] border border-[rgba(255,200,0,0.3)]",
  error:
    "bg-[rgba(232,17,35,0.15)] text-[#F1707A] border border-[rgba(232,17,35,0.3)]",
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
