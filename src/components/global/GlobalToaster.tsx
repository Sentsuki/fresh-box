import { Toast } from "@base-ui/react/toast";
import {
  CheckmarkCircleFilled,
  DismissRegular,
  ErrorCircleFilled,
  InfoFilled,
  WarningFilled,
} from "@fluentui/react-icons";
import {
  toastManager,
  type ToastData,
  type ToastIntent,
} from "../../hooks/useToast";

const INTENT_ICONS: Record<ToastIntent, React.ReactNode> = {
  success: <CheckmarkCircleFilled className="text-(--wb-success)" />,
  error: <ErrorCircleFilled className="text-(--wb-error)" />,
  info: <InfoFilled className="text-(--wb-accent)" />,
  warning: <WarningFilled className="text-(--wb-warning)" />,
};

function ToastList() {
  const { toasts } = Toast.useToastManager<ToastData>();
  return toasts.map((item) => (
    <Toast.Root
      key={item.id}
      toast={item}
      swipeDirection="right"
      className={[
        "flex gap-3 w-full p-3 pr-2 rounded-(--wb-radius-lg) shadow-xl",
        "bg-(--wb-surface-flyout) border border-(--wb-border-default)",
        "transition-[opacity,translate] duration-200",
        "translate-x-[var(--toast-swipe-movement-x,0px)]",
        "data-[starting-style]:opacity-0 data-[starting-style]:translate-x-6",
        "data-[ending-style]:opacity-0 data-[ending-style]:translate-x-6",
        "data-[swiping]:transition-none",
        // 超出 `limit` 的旧 toast 不会被移除而是标成 limited，直接藏掉。
        "data-[limited]:hidden",
      ].join(" ")}
    >
      <span className="shrink-0 text-xl leading-none mt-px">
        {INTENT_ICONS[(item.type as ToastIntent | undefined) ?? "info"]}
      </span>
      <Toast.Content className="flex-1 min-w-0 flex flex-col gap-1">
        <Toast.Title className="text-sm font-semibold text-(--wb-text-primary) break-words" />
        <Toast.Description className="text-xs text-(--wb-text-secondary) break-words" />
        {item.data?.actions && (
          <div className="flex gap-4 mt-1">
            {item.data.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  toastManager.close(item.id);
                  action.onClick();
                }}
                className="text-xs font-medium text-(--wb-accent) hover:underline"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </Toast.Content>
      <Toast.Close
        aria-label="Dismiss"
        className="shrink-0 self-start p-1 rounded text-(--wb-text-tertiary) hover:text-(--wb-text-primary) hover:bg-(--wb-surface-hover)"
      >
        <DismissRegular />
      </Toast.Close>
    </Toast.Root>
  ));
}

export function GlobalToaster() {
  return (
    <Toast.Provider toastManager={toastManager} limit={5}>
      <Toast.Portal>
        <Toast.Viewport className="fixed bottom-4 right-4 z-70 flex flex-col-reverse gap-2 w-80 outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
