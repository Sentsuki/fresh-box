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
  // job the moment it's read), so it gets more time on screen and a direct
  // way to act right from the toast instead of only through Settings.
  // fresh-box never downloads/installs anything itself — `onView` is always
  // just "open the release page in the browser", the same manual step the
  // user would take checking by hand.
  const updateAvailable = useCallback(
    (version: string, onView: () => void) => {
      dispatchToast(
        <Toast>
          <ToastTitle>Update available</ToastTitle>
          <ToastBody subtitle={`fresh-box ${version} is ready to view`}>
            fresh-box only checks for new releases — it never downloads or
            installs one on its own.
          </ToastBody>
          <ToastFooter>
            <Link onClick={onView}>View release</Link>
          </ToastFooter>
        </Toast>,
        { intent: "info", timeout: 15000 },
      );
    },
    [dispatchToast],
  );

  return { success, error, info, warning, updateAvailable };
}
