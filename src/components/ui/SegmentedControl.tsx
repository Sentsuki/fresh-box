import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "./cn";

interface SegmentedControlProps<T extends string> {
  /** 当前选中项；`allowEmpty` 时 `""` 表示一个都没选。 */
  value: T | "";
  onValueChange: (value: T | "") => void;
  options: readonly { value: T; label: React.ReactNode }[];
  /** 再点一次已选中的项是否取消选中。默认不允许 —— 必须始终选中一项。 */
  allowEmpty?: boolean;
  className?: string;
  itemClassName?: string;
}

/**
 * 单选的分段按钮。方向键切换焦点、`aria-pressed` 这些交给 Base UI 的
 * ToggleGroup；这里只管样式。
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  allowEmpty = false,
  className = "",
  itemClassName = "",
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup
      value={value ? [value] : []}
      onValueChange={(next) => {
        const picked = (next[0] as T | undefined) ?? "";
        if (!picked && !allowEmpty) return;
        onValueChange(picked);
      }}
      className={cn(
        "flex rounded-(--wb-radius-md) border border-(--wb-border-subtle) bg-(--wb-surface-layer) winui-segmented-control",
        className,
      )}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className={cn(
            "rounded transition-colors",
            "text-(--wb-text-secondary) hover:text-(--wb-text-primary)",
            "data-pressed:bg-(--wb-surface-hover) data-pressed:text-(--wb-text-primary)",
            "focus-visible:outline focus-visible:outline-(--wb-accent)",
            itemClassName,
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
