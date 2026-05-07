interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}

export function Card({
  children,
  className = "",
  onClick,
  selected,
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
      className={[
        "rounded-(--wb-radius-lg) border p-4",
        "bg-(--wb-surface-layer)",
        selected
          ? "border-(--wb-accent)"
          : "border-(--wb-border-subtle)",
        onClick
          ? "cursor-pointer hover:bg-(--wb-surface-hover) transition-colors duration-100"
          : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
