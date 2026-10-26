import { Select as BaseSelect } from "@base-ui/react/select";
import { CheckmarkRegular, ChevronDownRegular } from "@fluentui/react-icons";
import { cn } from "./cn";

export interface SelectOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
}

interface SelectProps<T extends string | number> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  disabled?: boolean;
  /** `ghost`：没有边框和底色，用在已经自带外框的地方（比如工具栏里的胶囊）。 */
  variant?: "default" | "ghost";
  className?: string;
  "aria-label"?: string;
}

const triggerVariants = {
  default:
    "px-3 py-1.5 rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) focus-visible:border-(--wb-accent) data-popup-open:border-(--wb-accent)",
  ghost: "rounded",
};

/**
 * 下拉选择。键盘操作、打字定位、弹层定位都交给 Base UI；选项列表自己画，
 * 所以深浅色主题下和应用其余部分一致（原生 `<select>` 的弹层是系统画的）。
 */
export function Select<T extends string | number>({
  value,
  onValueChange,
  options,
  disabled,
  variant = "default",
  className = "",
  "aria-label": ariaLabel,
}: SelectProps<T>) {
  return (
    <BaseSelect.Root
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center justify-between gap-2 text-sm text-(--wb-text-primary) outline-none",
          "focus-visible:outline-(--wb-accent) data-disabled:opacity-50 data-disabled:cursor-not-allowed",
          triggerVariants[variant],
          className,
        )}
      >
        <BaseSelect.Value className="truncate" />
        <BaseSelect.Icon className="shrink-0 flex text-(--wb-text-tertiary)">
          <ChevronDownRegular />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="z-50 outline-none">
          <BaseSelect.Popup
            className={cn(
              "min-w-(--anchor-width) max-h-(--available-height) overflow-y-auto custom-scrollbar p-1",
              "rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-flyout) shadow-xl outline-none",
              "origin-(--transform-origin) transition-[opacity,scale] duration-100",
              "data-starting-style:opacity-0 data-starting-style:scale-95",
              "data-ending-style:opacity-0 data-ending-style:scale-95",
            )}
          >
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  className={cn(
                    "flex items-center gap-2 pl-2 pr-3 py-1.5 text-sm rounded cursor-default select-none outline-none",
                    "text-(--wb-text-primary) data-highlighted:bg-(--wb-surface-hover)",
                    "data-disabled:opacity-50",
                  )}
                >
                  {/* 定宽占位：没选中的项也空出勾的位置，文字才对得齐。 */}
                  <span className="w-4 shrink-0 flex">
                    <BaseSelect.ItemIndicator className="flex text-(--wb-accent)">
                      <CheckmarkRegular />
                    </BaseSelect.ItemIndicator>
                  </span>
                  <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
