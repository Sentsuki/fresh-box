interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
  variant?: "default" | "alt";
}

export function Card({
  children,
  className = "",
  onClick,
  selected,
  variant = "default",
}: CardProps) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
      style={{ fontFamily: "var(--wb-font-base)" }}
      className={[
        "relative rounded-(--wb-radius-lg) border p-4 transition-all duration-100",
        variant === "default" ? "bg-(--wb-surface-layer)" : "bg-(--wb-surface-layer-alt)",
        selected
          ? "border-(--wb-accent) ring-1 ring-(--wb-accent)/20"
          : "border-(--wb-border-subtle)",
        onClick
          ? "cursor-pointer hover:bg-(--wb-surface-hover) active:bg-(--wb-surface-active) active:scale-[0.995]"
          : "",
        className,
      ].join(" ")}
    >
      {selected && (
        <div className="absolute left-0 top-3 bottom-3 w-1 bg-(--wb-accent) rounded-r-full" />
      )}
      {children}
    </div>
  );
}

