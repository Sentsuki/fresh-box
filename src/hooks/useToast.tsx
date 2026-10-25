import { Toast } from "@base-ui/react/toast";

/**
 * 全局唯一的 toast 管理器。模块级而不是挂在 React context 上：store、daemon
 * 流这些 React 之外的代码也能直接弹提示，不必再让调用方把回调一路传进去。
 * `GlobalToaster` 把它交给 `Toast.Provider` 来渲染。
 */
export const toastManager = Toast.createToastManager<ToastData>();

export type ToastIntent = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  /** 底部的操作链接。点任何一个都会先关掉这条 toast。 */
  actions?: ToastAction[];
}

const TIMEOUTS: Record<ToastIntent, number> = {
  success: 3000,
  error: 5000,
  info: 3000,
  warning: 4000,
};

function show(intent: ToastIntent, title: string, body?: string) {
  toastManager.add({
    type: intent,
    title,
    description: body,
    timeout: TIMEOUTS[intent],
    priority: intent === "error" ? "high" : "low",
  });
}

export const toast = {
  success: (title: string, body?: string) => show("success", title, body),
  error: (title: string, body?: string) => show("error", title, body),
  info: (title: string, body?: string) => show("info", title, body),
  warning: (title: string, body?: string) => show("warning", title, body),

  // A longer-lived, actionable variant for "an update is available" — the
  // one case here where dismissing the toast without acting is expected to
  // be the common outcome (unlike a success/error toast, which is done its
  // job the moment it's read), so it gets more time on screen. Deliberately
  // does *not* start the download/install directly from the toast —
  // installing restarts the app (`relaunch()`, once the update finishes
  // installing), which isn't something a single click on a passive
  // notification should trigger unattended; `onView` instead navigates to
  // Settings' Updates card, where the actual "Download & Install" action
  // lives next to the release notes.
  updateAvailable: (version: string, onView: () => void) => {
    toastManager.add({
      type: "info",
      title: "Update available",
      description: `fresh-box ${version} is ready to install. Review it in Settings before installing — updating restarts the app.`,
      timeout: 15000,
      data: { actions: [{ label: "Go to Settings", onClick: onView }] },
    });
  },

  // The one-time opt-in prompt for automatic update checks (mirrors the
  // official desktop client's own opt-in default — see
  // `config::app_settings::UpdateSettings`'s doc comment). Only marks
  // itself "answered" when the user actually clicks one of the two
  // choices; timing out or swiping it away just means it asks again next
  // launch rather than silently locking in an answer nobody gave.
  enableUpdateCheckPrompt: (onEnable: () => void, onDecline: () => void) => {
    toastManager.add({
      type: "info",
      title: "Check for updates automatically?",
      description:
        "fresh-box can check GitHub on launch for a newer release. Nothing downloads or installs without you confirming it in Settings.",
      timeout: 20000,
      data: {
        actions: [
          { label: "Enable", onClick: onEnable },
          { label: "Not now", onClick: onDecline },
        ],
      },
    });
  },
};

/** 组件里沿用的入口。返回的是同一个稳定对象，放进依赖数组不会引起重跑。 */
export function useToast() {
  return toast;
}
