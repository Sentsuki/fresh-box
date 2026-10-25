import { Switch as BaseSwitch } from "@base-ui/react/switch";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  id,
}: SwitchProps) {
  return (
    <label
      className="flex items-center gap-3 cursor-pointer select-none"
      htmlFor={id}
    >
      <BaseSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        disabled={disabled}
        className={[
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center",
          "rounded-full border border-(--wb-border-default)",
          "transition-colors duration-100",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--wb-accent)",
          "data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed",
          "bg-(--wb-surface-hover)",
          "data-[checked]:bg-(--wb-accent) data-[checked]:border-(--wb-accent)",
        ].join(" ")}
      >
        <BaseSwitch.Thumb
          className={[
            "pointer-events-none block h-3.5 w-3.5 rounded-full shadow-sm",
            "transition-transform duration-100",
            "translate-x-0.5 bg-(--wb-text-secondary)",
            "data-[checked]:translate-x-4 data-[checked]:bg-(--wb-accent-fg)",
          ].join(" ")}
        />
      </BaseSwitch.Root>
      {label && (
        <span className="text-sm text-(--wb-text-primary)">{label}</span>
      )}
    </label>
  );
}
