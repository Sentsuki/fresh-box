import { useCallback } from "react";
import {
  Toast,
  ToastBody,
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

  return { success, error, info, warning };
}
