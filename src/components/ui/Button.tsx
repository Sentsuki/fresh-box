import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "accent" | "subtle" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

const variantClasses = {
  default:
    "bg-[var(--wb-surface-hover)] hover:bg-[var(--wb-surface-active)] border border-[var(--wb-border-default)] text-[var(--wb-text-primary)]",
  accent:
    "bg-[var(--wb-accent)] hover:bg-[var(--wb-accent-hover)] active:bg-[var(--wb-accent-pressed)] text-[var(--wb-accent-fg)] border border-transparent font-medium",
  subtle:
    "bg-[var(--wb-surface-hover)] hover:bg-[var(--wb-surface-active)] border border-transparent text-[var(--wb-text-primary)]",
  ghost:
    "bg-transparent hover:bg-[var(--wb-surface-hover)] border border-transparent text-[var(--wb-text-primary)]",
};

const sizeClasses = {
  sm: "px-2 py-1 text-xs gap-1 rounded-[var(--wb-radius-sm)]",
  md: "px-3 py-1.5 text-sm gap-1.5 rounded-[var(--wb-radius-md)]",
  lg: "px-4 py-2 text-sm gap-2 rounded-[var(--wb-radius-md)]",
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
        className={[
          "inline-flex items-center justify-center font-normal",
          "transition-colors duration-100",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--wb-accent)] focus-visible:outline-offset-1",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(" ")}
        {...props}
      >
        {icon && (
          <span className="flex-shrink-0 text-[1.1em]">{icon}</span>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
