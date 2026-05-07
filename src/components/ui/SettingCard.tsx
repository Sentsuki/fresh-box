import type { ReactNode } from "react";

interface SettingCardProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  control?: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export function SettingCard({
  icon,
  title,
  description,
  control,
  onClick,
  className = "",
  disabled = false,
}: SettingCardProps) {
  const isClickable = !!onClick && !disabled;

  const Wrapper = isClickable ? "button" : "div";

  return (
    <Wrapper
      onClick={isClickable ? onClick : undefined}
      disabled={disabled}
      className={[
        "w-full flex items-center gap-4 px-4 py-3 min-h-[72px]",
        "bg-(--wb-surface-layer) border border-(--wb-border-subtle) rounded-(--wb-radius-md) shadow-sm",
        isClickable
          ? "cursor-pointer hover:bg-(--wb-surface-hover) active:bg-(--wb-surface-active) transition-colors text-left"
          : "",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className,
      ].join(" ")}
    >
      {icon && (
        <div className="shrink-0 text-xl text-(--wb-text-secondary) flex items-center justify-center w-8 h-8">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="text-sm font-medium text-(--wb-text-primary) truncate">
          {title}
        </div>
        {description && (
          <div className="text-xs text-(--wb-text-secondary) mt-0.5 leading-snug">
            {description}
          </div>
        )}
      </div>
      {control && (
        <div
          className="shrink-0 ml-4"
          onClick={isClickable ? (e) => e.stopPropagation() : undefined}
        >
          {control}
        </div>
      )}
    </Wrapper>
  );
}

interface SettingGroupProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function SettingGroup({
  title,
  children,
  className = "",
}: SettingGroupProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {title && (
        <h2 className="text-sm font-semibold text-(--wb-text-primary) px-1 pb-1">
          {title}
        </h2>
      )}
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}
