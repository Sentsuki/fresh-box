import * as React from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={[
          "px-3 py-1.5 text-sm rounded-(--wb-radius-md)",
          "border border-(--wb-border-default)",
          "bg-(--wb-surface-base) text-(--wb-text-primary)",
          "outline-none focus:border-(--wb-accent)",
          "disabled:opacity-50",
          className,
        ].join(" ")}
        {...props}
      >
        {children}
      </select>
    );
  },
);

Select.displayName = "Select";
