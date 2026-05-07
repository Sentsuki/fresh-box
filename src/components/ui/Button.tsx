import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "accent" | "subtle" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

const variantClasses = {
  default:
    "bg-(--wb-surface-layer) hover:bg-(--wb-surface-hover) active:bg-(--wb-surface-active) border border-(--wb-border-default) border-b-(--wb-border-strong) text-(--wb-text-primary)",
  accent:
    "bg-(--wb-accent) hover:bg-(--wb-accent-hover) active:bg-(--wb-accent-pressed) text-(--wb-accent-fg) border border-transparent font-medium shadow-[0_1px_1px_rgba(0,0,0,0.1)]",
  subtle:
    "bg-transparent hover:bg-(--wb-surface-hover) active:bg-(--wb-surface-active) border border-transparent text-(--wb-text-primary)",
  ghost:
    "bg-transparent hover:bg-(--wb-surface-hover) border border-transparent text-(--wb-text-primary)",
};

const sizeClasses = {
  sm: "px-2 py-1 text-xs gap-1.5 rounded-(--wb-radius-sm)",
  md: "px-3 py-1.5 text-sm gap-2 rounded-(--wb-radius-md)",
  lg: "px-4 py-2 text-sm gap-2 rounded-(--wb-radius-md)",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "default",
      size = "md",
      icon,
      children,
      className = "",
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        style={{ fontFamily: "var(--wb-font-base)" }}
        className={[
          "inline-flex items-center justify-center font-normal select-none",
          "transition-all duration-75 ease-in-out",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--wb-accent) focus-visible:outline-offset-1",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          "active:scale-[0.98]",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(" ")}
        {...props}
      >
        {icon && (
          <span className="shrink-0 text-[1.1em]">{icon}</span>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

