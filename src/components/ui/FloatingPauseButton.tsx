import { PauseRegular, PlayRegular } from "@fluentui/react-icons";

/** 右下角浮着的暂停/继续按钮 —— 连接页和日志页冻结实时刷新用。 */
export function FloatingPauseButton({
  paused,
  onToggle,
}: {
  paused: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={[
        "fixed bottom-10 right-6 z-50",
        "w-12 h-12 rounded-full",
        "flex items-center justify-center",
        "backdrop-blur-md",
        paused
          ? "bg-(--wb-accent) text-(--wb-accent-fg) hover:bg-(--wb-accent-hover)"
          : "bg-(--wb-surface-flyout) text-(--wb-text-primary) hover:bg-(--wb-surface-hover) border border-(--wb-border-subtle)",
        "transition-all duration-200",
      ].join(" ")}
      title={paused ? "Resume" : "Pause"}
      aria-label={paused ? "Resume" : "Pause"}
      aria-pressed={paused}
    >
      {paused ? (
        <PlayRegular className="w-5 h-5" />
      ) : (
        <PauseRegular className="w-5 h-5" />
      )}
    </button>
  );
}
