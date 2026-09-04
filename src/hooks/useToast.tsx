import { useCallback } from "react";
import {
  Link,
  Toast,
  ToastBody,
  ToastFooter,
  ToastTitle,
  useToastController,
} from "@fluentui/react-components";

export const TOASTER_ID = "global";

export function useToast() {
  const { dispatchToast } = useToastController(TOASTER_ID);

  const success = useCallback(
    (title: string, body?: string) => {
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {body && <ToastBody>{body}</ToastBody>}
        </Toast>,
        { intent: "success", timeout: 3000 },
      );
    },
    [dispatchToast],
  );

  const error = useCallback(
    (title: string, body?: string) => {
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {body && <ToastBody>{body}</ToastBody>}
        </Toast>,
        { intent: "error", timeout: 5000 },
      );
    },
    [dispatchToast],
  );

  const info = useCallback(
    (title: string, body?: string) => {
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {body && <ToastBody>{body}</ToastBody>}
        </Toast>,
        { intent: "info", timeout: 3000 },
      );
    },
    [dispatchToast],
  );

  const warning = useCallback(
    (title: string, body?: string) => {
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {body && <ToastBody>{body}</ToastBody>}
        </Toast>,
        { intent: "warning", timeout: 4000 },
      );
    },
    [dispatchToast],
  );

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
  const updateAvailable = useCallback(
    (version: string, onView: () => void) => {
      dispatchToast(
        <Toast>
          <ToastTitle>Update available</ToastTitle>
          <ToastBody subtitle={`fresh-box ${version} is ready to install`}>
            Review it in Settings before installing — updating restarts the
            app.
          </ToastBody>
          <ToastFooter>
            <Link onClick={onView}>Go to Settings</Link>
          </ToastFooter>
        </Toast>,
        { intent: "info", timeout: 15000 },
      );
    },
    [dispatchToast],
  );

  // The one-time opt-in prompt for automatic update checks (mirrors the
  // official desktop client's own opt-in default — see
  // `config::app_settings::UpdateSettings`'s doc comment). Only marks
  // itself "answered" when the user actually clicks one of the two
  // choices; timing out or swiping it away just means it asks again next
  // launch rather than silently locking in an answer nobody gave.
  const enableUpdateCheckPrompt = useCallback(
    (onEnable: () => void, onDecline: () => void) => {
      dispatchToast(
        <Toast>
          <ToastTitle>Check for updates automatically?</ToastTitle>
          <ToastBody>
            fresh-box can check GitHub on launch for a newer release.
            Nothing downloads or installs without you confirming it in
            Settings.
          </ToastBody>
          <ToastFooter>
            <Link onClick={onEnable}>Enable</Link>
            <Link onClick={onDecline}>Not now</Link>
          </ToastFooter>
        </Toast>,
        { intent: "info", timeout: 20000 },
      );
    },
    [dispatchToast],
  );

  return {
    success,
    error,
    info,
    warning,
    updateAvailable,
    enableUpdateCheckPrompt,
  };
}
