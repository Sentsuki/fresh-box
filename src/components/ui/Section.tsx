interface SectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}

export function Section({
  title,
  description,
  children,
  className = "",
  actions,
  icon,
}: SectionProps) {
  return (
    <section className={["flex flex-col gap-3", className].join(" ")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="text-[var(--wb-text-secondary)] text-sm flex-shrink-0">
              {icon}
            </span>
          )}
          <div>
            <h3 className="text-sm font-semibold text-[var(--wb-text-primary)]">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-[var(--wb-text-secondary)] mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      <div>{children}</div>
    </section>
  );
}
