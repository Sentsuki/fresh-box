import { useEffect } from 'react';
import {
  Toaster,
  useToastController,
  Toast,
  ToastTitle,
  ToastBody
} from '@fluentui/react-components';
import { useToastStore } from '../hooks/useToast';

const toasterId = 'global-toaster';

export default function GlobalToaster() {
  const { dispatchToast } = useToastController(toasterId);
  const pendingToasts = useToastStore((state) => state.pendingToasts);
  const shiftToast = useToastStore((state) => state.shiftToast);

  useEffect(() => {
    if (pendingToasts.length > 0) {
      const currentToast = pendingToasts[0];
      dispatchToast(
        <Toast>
          <ToastTitle>{currentToast.type.toUpperCase()}</ToastTitle>
          <ToastBody>{currentToast.message}</ToastBody>
        </Toast>,
        { intent: currentToast.type }
      );
      shiftToast();
    }
  }, [pendingToasts, dispatchToast, shiftToast]);

  return <Toaster toasterId={toasterId} position="bottom-end" />;
}
