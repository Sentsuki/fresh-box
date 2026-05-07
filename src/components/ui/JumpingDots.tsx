export function JumpingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.75 h-4 ${className}`}>
      <span className="w-1 h-1 rounded-full bg-current animate-[jumping_0.8s_infinite] [animation-delay:-0.32s]" />
      <span className="w-1 h-1 rounded-full bg-current animate-[jumping_0.8s_infinite] [animation-delay:-0.16s]" />
      <span className="w-1 h-1 rounded-full bg-current animate-[jumping_0.8s_infinite]" />
    </span>
  );
}
