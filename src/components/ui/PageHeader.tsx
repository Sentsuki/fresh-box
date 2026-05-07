import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode; // For optional right-aligned actions
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-(--wb-text-primary)">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-(--wb-text-secondary)">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
