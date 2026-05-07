interface KeyValueProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function KeyValue({ label, value, className = "" }: KeyValueProps) {
  return (
    <div
      className={[
        "flex items-center justify-between py-2 border-b border-(--wb-border-subtle) last:border-b-0",
        className,
      ].join(" ")}
    >
      <span className="text-xs text-(--wb-text-secondary) flex-shrink-0 min-w-0">
        {label}
      </span>
      <span className="text-xs text-(--wb-text-primary) text-right ml-4 truncate">
        {value}
      </span>
    </div>
  );
}
