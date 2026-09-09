import * as RadixTabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";

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
  // 受控/非受控二选一：外部传了 `value` 就跟着它走，否则自己维护一份，
  // 单纯用来知道"当前激活的是哪个 tab"以驱动下面的滑动下划线——Radix 自己
  // 也维护了这份状态，但没有把它暴露出来给下划线的位置计算用。
  const [internalValue, setInternalValue] = useState(
    value ?? defaultValue ?? tabs[0]?.value,
  );
  const activeValue = value ?? internalValue;

  const listRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);

  // 下划线的位置量的是"激活按钮相对 list 容器的偏移"，而不是每个按钮自己
  // 画一条——这样它只可能出现在 list 这一行的高度范围内，不会因为某个
  // 按钮换行、容器变窄之类的意外情况被顶到下面的内容上面去。
  useLayoutEffect(() => {
    const list = listRef.current;
    const trigger = triggerRefs.current.get(activeValue);
    if (!list || !trigger) {
      setIndicator(null);
      return;
    }
    const update = () => {
      const listRect = list.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      setIndicator({
        left: triggerRect.left - listRect.left + list.scrollLeft,
        width: triggerRect.width,
      });
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeValue, tabs]);

  return (
    <RadixTabs.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(v) => {
        setInternalValue(v);
        onValueChange?.(v);
      }}
      className={["flex flex-col min-h-0", className].join(" ")}
    >
      <RadixTabs.List
        ref={listRef}
        className="relative isolate shrink-0 mb-5 flex gap-1 flex-nowrap overflow-x-auto border-b border-(--wb-border-subtle)"
      >
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            ref={(el) => {
              if (el) triggerRefs.current.set(tab.value, el);
              else triggerRefs.current.delete(tab.value);
            }}
            value={tab.value}
            className={[
              "px-3 py-2 text-sm shrink-0 whitespace-nowrap transition-colors duration-100",
              "text-(--wb-text-secondary) hover:text-(--wb-text-primary)",
              "focus-visible:outline-none",
              "data-[state=active]:text-(--wb-text-primary)",
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
        {indicator && (
          <motion.span
            className="absolute bottom-0 h-0.5 bg-(--wb-accent) pointer-events-none"
            animate={{ left: indicator.left, width: indicator.width }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export function TabContent(
  props: React.ComponentProps<typeof RadixTabs.Content>,
) {
  return <RadixTabs.Content {...props} />;
}
