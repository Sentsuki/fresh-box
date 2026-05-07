interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "accent" | "success" | "warning" | "error" | "subtle";
  className?: string;
}

const variantClasses = {
  default:
    "bg-(--wb-badge-default-bg) text-(--wb-text-secondary) border border-(--wb-border-subtle)",
  accent:
    "bg-(--wb-badge-accent-bg) text-(--wb-accent) border border-(--wb-accent)/20",
  success:
    "bg-(--wb-badge-success-bg) text-(--wb-success) border border-(--wb-success-border)",
  warning:
    "bg-(--wb-badge-warning-bg) text-(--wb-warning) border border-(--wb-warning-border)",
  error:
    "bg-(--wb-badge-error-bg) text-(--wb-error) border border-(--wb-error-border)",
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
