import {
  Toast,
  ToastBody,
  ToastTitle,
  useToastController,
} from "@fluentui/react-components";

export const TOASTER_ID = "global";

export function useToast() {
  const { dispatchToast } = useToastController(TOASTER_ID);

  function success(title: string, body?: string) {
    dispatchToast(
      <Toast>
        <ToastTitle>{title}</ToastTitle>
        {body && <ToastBody>{body}</ToastBody>}
      </Toast>,
      { intent: "success", timeout: 3000 },
    );
  }

  function error(title: string, body?: string) {
    dispatchToast(
      <Toast>
        <ToastTitle>{title}</ToastTitle>
        {body && <ToastBody>{body}</ToastBody>}
      </Toast>,
      { intent: "error", timeout: 5000 },
    );
  }

  function info(title: string, body?: string) {
    dispatchToast(
      <Toast>
        <ToastTitle>{title}</ToastTitle>
        {body && <ToastBody>{body}</ToastBody>}
      </Toast>,
      { intent: "info", timeout: 3000 },
    );
  }

  function warning(title: string, body?: string) {
    dispatchToast(
      <Toast>
        <ToastTitle>{title}</ToastTitle>
        {body && <ToastBody>{body}</ToastBody>}
      </Toast>,
      { intent: "warning", timeout: 4000 },
    );
  }

  return { success, error, info, warning };
}
