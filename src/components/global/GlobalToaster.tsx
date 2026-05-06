import { Toaster } from "@fluentui/react-components";
import { TOASTER_ID } from "../../hooks/useToast";

export function GlobalToaster() {
  return (
    <Toaster
      toasterId={TOASTER_ID}
      position="bottom-end"
      pauseOnHover
      pauseOnWindowBlur
    />
  );
}
