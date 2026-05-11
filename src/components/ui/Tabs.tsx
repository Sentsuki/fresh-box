import * as RadixTabs from "@radix-ui/react-tabs";

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
    <RadixTabs.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      className={["flex flex-col min-h-0", className].join(" ")}
    >
      <RadixTabs.List className="flex gap-1 border-b border-(--wb-border-subtle) mb-4 shrink-0">
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={[
              "px-3 py-2 text-sm relative transition-colors duration-100",
              "text-(--wb-text-secondary) hover:text-(--wb-text-primary)",
              "focus-visible:outline-none",
              "data-[state=active]:text-(--wb-text-primary)",
              "after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5",
              "after:bg-(--wb-accent) after:scale-x-0 data-[state=active]:after:scale-x-100",
              "after:transition-transform after:duration-150",
            ].join(" ")}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-[11px] text-(--wb-text-tertiary)">
                {tab.count}
              </span>
            )}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export function TabContent(props: React.ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content {...props} />;
}
