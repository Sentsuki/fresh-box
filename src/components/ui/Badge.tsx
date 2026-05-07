interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "accent" | "success" | "warning" | "error" | "subtle";
  className?: string;
}

const variantClasses = {
  default:
    "bg-(--wb-surface-hover) text-(--wb-text-secondary) border border-(--wb-border-subtle)",
  accent:
    "bg-[rgba(96,205,255,0.15)] text-(--wb-accent) border border-[rgba(96,205,255,0.3)]",
  success:
    "bg-(--wb-success-bg) text-(--wb-success) border border-(--wb-success-border)",
  warning:
    "bg-(--wb-warning-bg) text-(--wb-warning) border border-(--wb-warning-border)",
  error:
    "bg-(--wb-error-bg) text-(--wb-error) border border-(--wb-error-border)",
  subtle:
    "bg-transparent text-(--wb-text-tertiary) border border-(--wb-border-subtle)",
};

export function Badge({
  children,
  variant = "default",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium rounded-(--wb-radius-sm) leading-tight",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
