import { Tabs as BaseTabs } from "@base-ui/react/tabs";

interface Tab {
  value: string;
  label: string;
  count?: number;
}

interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  tabs: Tab[];
  children: React.ReactNode;
  className?: string;
}

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  tabs,
  children,
  className = "",
}: TabsProps) {
  return (
    <BaseTabs.Root
      value={value}
      defaultValue={
        defaultValue ?? (value === undefined ? tabs[0]?.value : undefined)
      }
      onValueChange={(v) => onValueChange?.(v as string)}
      className={["flex flex-col min-h-0", className].join(" ")}
    >
      <BaseTabs.List
        activateOnFocus
        className="relative isolate shrink-0 mb-5 flex gap-1 flex-nowrap overflow-x-auto border-b border-(--wb-border-subtle)"
      >
        {tabs.map((tab) => (
          <BaseTabs.Tab
            key={tab.value}
            value={tab.value}
            className={[
              "px-3 py-2 text-sm shrink-0 whitespace-nowrap transition-colors duration-100",
              "text-(--wb-text-secondary) hover:text-(--wb-text-primary)",
              "focus-visible:outline-none",
              "data-active:text-(--wb-text-primary)",
            ].join(" ")}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-[11px] text-(--wb-text-tertiary)">
                {tab.count}
              </span>
            )}
          </BaseTabs.Tab>
        ))}
        {/* 位置由 Base UI 量好后通过 --active-tab-* 变量给出，相对 list 容器，
            所以下划线只会出现在 list 这一行里，不会被顶到下面的内容上。 */}
        <BaseTabs.Indicator
          className={[
            "absolute bottom-0 left-0 h-0.5 bg-(--wb-accent) pointer-events-none",
            "w-(--active-tab-width) translate-x-(--active-tab-left)",
            "transition-[translate,width] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          ].join(" ")}
        />
      </BaseTabs.List>
      {children}
    </BaseTabs.Root>
  );
}

export function TabContent(props: BaseTabs.Panel.Props) {
  return <BaseTabs.Panel {...props} />;
}
