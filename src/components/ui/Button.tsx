import { type ButtonHTMLAttributes, forwardRef } from "react";
import { Spinner } from "./Spinner";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "accent" | "subtle" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  loading?: boolean;
}

const variantClasses = {
  default:
    "bg-(--wb-surface-hover) hover:bg-(--wb-surface-active) border border-(--wb-border-default) text-(--wb-text-primary)",
  accent:
    "bg-(--wb-accent) hover:bg-(--wb-accent-hover) active:bg-(--wb-accent-pressed) text-(--wb-accent-fg) border border-transparent font-medium",
  subtle:
    "bg-(--wb-surface-hover) hover:bg-(--wb-surface-active) border border-transparent text-(--wb-text-primary)",
  ghost:
    "bg-transparent hover:bg-(--wb-surface-hover) border border-transparent text-(--wb-text-primary)",
};

const sizeClasses = {
  sm: "px-2 py-1 text-xs gap-1 rounded-(--wb-radius-sm)",
  md: "px-3 py-1.5 text-sm gap-1.5 rounded-(--wb-radius-md)",
  lg: "px-4 py-2 text-sm gap-2 rounded-(--wb-radius-md)",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "default",
      size = "md",
      icon,
      loading = false,
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
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center font-normal",
          "transition-colors duration-100",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--wb-accent) focus-visible:outline-offset-1",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(" ")}
        {...props}
      >
        {loading ? (
          <Spinner size="sm" className="mr-0.5 border-t-current" />
        ) : (
          icon && (
            <span className="flex-shrink-0 text-[1.1em]">{icon}</span>
          )
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
