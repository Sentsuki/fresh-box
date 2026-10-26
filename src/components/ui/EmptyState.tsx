import { cn } from "./cn";

interface EmptyStateProps {
  title?: string;
  description: React.ReactNode;
  /**
   * `card`：带边框的卡片，用在页面内容里的一块（某个列表为空）。
   * `page`：没有边框、撑满整页，用在整页都没东西可显示的时候。
   */
  variant?: "card" | "page";
  /** 显示在文字上方，比如加载中的转圈。 */
  icon?: React.ReactNode;
  /** 高度之类的布局类。 */
  className?: string;
}

/** 「这里没有东西」的占位。 */
export function EmptyState({
  title,
  description,
  variant = "card",
  icon,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center text-sm text-(--wb-text-secondary)",
        variant === "card"
          ? "py-8 bg-(--wb-surface-layer) border border-(--wb-border-subtle) rounded-(--wb-radius-md) shadow-sm"
          : "h-full w-full opacity-70",
        className,
      )}
    >
      {icon}
      {title && (
        <span className="font-semibold text-lg text-(--wb-text-primary)">
          {title}
        </span>
      )}
      <span>{description}</span>
    </div>
  );
}
