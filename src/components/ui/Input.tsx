import * as React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-xs font-semibold text-(--wb-text-secondary) uppercase tracking-wider">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-(--wb-text-tertiary) flex items-center justify-center pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={[
              "w-full rounded-(--wb-radius-md) border bg-(--wb-surface-base) py-2 text-sm text-(--wb-text-primary) outline-none transition-all duration-200",
              "placeholder:text-(--wb-text-disabled)",
              leftIcon ? "pl-9 pr-3" : "px-3",
              error
                ? "border-red-500/50 focus:border-red-500"
                : "border-(--wb-border-default) focus:border-(--wb-accent) focus:ring-1 focus:ring-(--wb-accent)/20",
              className,
            ].join(" ")}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
