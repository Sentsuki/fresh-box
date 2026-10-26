import { DismissRegular, SearchRegular } from "@fluentui/react-icons";
import { cn } from "./cn";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 宽度之类的布局类。 */
  className?: string;
}

/** 工具栏里的搜索框：放大镜图标 + 输入框，有内容时显示清除按钮。 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  className = "",
}: SearchBoxProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-layer)",
        className,
      )}
    >
      <SearchRegular className="shrink-0 text-(--wb-text-tertiary)" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) onChange("");
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 min-w-0 bg-transparent text-sm outline-none text-(--wb-text-primary) placeholder:text-(--wb-text-disabled) [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="shrink-0 hover:bg-(--wb-surface-hover) rounded p-0.5"
        >
          <DismissRegular className="text-(--wb-text-tertiary) text-xs" />
        </button>
      )}
    </div>
  );
}
