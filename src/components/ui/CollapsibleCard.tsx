import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDownRegular } from "@fluentui/react-icons";
import { cn } from "./cn";

interface CollapsibleCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function CollapsibleCard({
  open,
  onOpenChange,
  trigger,
  children,
  className = "",
  actions,
}: CollapsibleCardProps) {
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      className={cn(
        "border border-(--wb-border-subtle) rounded-(--wb-radius-lg) overflow-hidden",
        "bg-(--wb-surface-layer)",
        className,
      )}
    >
      <div className="flex items-stretch">
        <Collapsible.Trigger
          className={cn(
            "flex flex-1 items-center justify-between gap-3 px-4 py-3 min-w-0",
            "hover:bg-(--wb-surface-hover)",
            "transition-colors duration-150 text-left",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--wb-accent)",
            "group",
          )}
        >
          <span className="flex-1 min-w-0">{trigger}</span>
          <ChevronDownRegular
            className={cn(
              "text-xl shrink-0 text-(--wb-text-secondary) transition-transform duration-300",
              "group-data-panel-open:rotate-180",
            )}
          />
        </Collapsible.Trigger>
        {actions && (
          <div className="shrink-0 flex items-center px-3 border-l border-(--wb-border-subtle)">
            {actions}
          </div>
        )}
      </div>
      <Collapsible.Panel
        className={cn(
          "overflow-hidden h-(--collapsible-panel-height)",
          "transition-[height] duration-150 ease-in-out",
          "data-starting-style:h-0 data-ending-style:h-0",
        )}
      >
        <div className="p-4 bg-(--wb-surface-base) border-t border-(--wb-border-subtle)">
          {children}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
