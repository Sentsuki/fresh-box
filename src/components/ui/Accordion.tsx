import * as RadixAccordion from "@radix-ui/react-accordion";
import { ChevronDownRegular } from "@fluentui/react-icons";

interface AccordionItemProps {
  value: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function AccordionItem({
  value,
  trigger,
  children,
  className = "",
  actions,
}: AccordionItemProps) {
  return (
    <RadixAccordion.Item
      value={value}
      className={[
        "border border-[var(--wb-border-subtle)] rounded-[var(--wb-radius-md)] overflow-hidden",
        className,
      ].join(" ")}
    >
      <RadixAccordion.Header>
        <div className="flex items-center">
          <RadixAccordion.Trigger
            className={[
              "flex flex-1 items-center justify-between px-4 py-3 min-w-0",
              "bg-[var(--wb-surface-layer)] hover:bg-[var(--wb-surface-hover)]",
              "transition-colors duration-100 text-left",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--wb-accent)]",
              "group",
            ].join(" ")}
          >
            <span className="flex-1 min-w-0">{trigger}</span>
            <ChevronDownRegular
              className={[
                "ml-2 flex-shrink-0 text-[var(--wb-text-secondary)] transition-transform duration-150",
                "group-data-[state=open]:rotate-180",
              ].join(" ")}
            />
          </RadixAccordion.Trigger>
          {actions && (
            <div className="flex-shrink-0 px-2 bg-[var(--wb-surface-layer)]">
              {actions}
            </div>
          )}
        </div>
      </RadixAccordion.Header>
      <RadixAccordion.Content
        className={[
          "overflow-hidden",
          "data-[state=open]:animate-[accordionOpen_0.15s_ease]",
          "data-[state=closed]:animate-[accordionClose_0.15s_ease]",
        ].join(" ")}
      >
        <div className="px-4 py-3 bg-[var(--wb-surface-base)]">{children}</div>
      </RadixAccordion.Content>
    </RadixAccordion.Item>
  );
}

interface AccordionProps {
  type?: "single" | "multiple";
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: ((value: string) => void) & ((value: string[]) => void);
  children: React.ReactNode;
  className?: string;
}

export function Accordion({
  type = "single",
  value,
  defaultValue,
  onValueChange,
  children,
  className = "",
}: AccordionProps) {
  if (type === "multiple") {
    return (
      <RadixAccordion.Root
        type="multiple"
        value={value as string[] | undefined}
        defaultValue={defaultValue as string[] | undefined}
        onValueChange={onValueChange as ((v: string[]) => void) | undefined}
        className={["flex flex-col gap-2", className].join(" ")}
      >
        {children}
      </RadixAccordion.Root>
    );
  }

  return (
    <RadixAccordion.Root
      type="single"
      collapsible
      value={value as string | undefined}
      defaultValue={defaultValue as string | undefined}
      onValueChange={onValueChange as ((v: string) => void) | undefined}
      className={["flex flex-col gap-2", className].join(" ")}
    >
      {children}
    </RadixAccordion.Root>
  );
}
