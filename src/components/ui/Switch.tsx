import * as RadixSwitch from "@radix-ui/react-switch";

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
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={[
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center",
          "rounded-full border border-(--wb-border-default)",
          "transition-colors duration-100",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--wb-accent)",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          checked
            ? "bg-(--wb-accent) border-(--wb-accent)"
            : "bg-(--wb-surface-hover)",
        ].join(" ")}
      >
        <RadixSwitch.Thumb
          className={[
            "pointer-events-none block h-3.5 w-3.5 rounded-full shadow-sm",
            "transition-transform duration-100",
            checked
              ? "translate-x-4 bg-(--wb-accent-fg)"
              : "translate-x-0.5 bg-(--wb-text-secondary)",
          ].join(" ")}
        />
      </RadixSwitch.Root>
      {label && (
        <span className="text-sm text-(--wb-text-primary)">{label}</span>
      )}
    </label>
  );
}
