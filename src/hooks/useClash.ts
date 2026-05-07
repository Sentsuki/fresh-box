import { useClashStore } from "../stores/clashStore";
import { useToast } from "./useToast";
import { useCallback } from "react";

export function useClash() {
  const { success, error, info } = useToast();

  const refreshOverview = useCallback(async () => {
    await useClashStore.getState().refreshOverview(true);
  }, []);

  const changeMode = useCallback(
    async (mode: string) => {
      await useClashStore.getState().changeMode(
        mode,
        (msg) => success(msg),
        (msg) => error(msg),
      );
    },
    [success, error],
  );

  const switchProxy = useCallback(
    async (proxyGroup: string, proxyName: string) => {
      await useClashStore.getState().switchProxy(
        proxyGroup,
        proxyName,
        (msg) => success(msg),
        (msg) => error(msg),
      );
    },
    [success, error],
  );

  const testDelay = useCallback(
    async (proxyName: string) => {
      await useClashStore.getState().testDelay(
        proxyName,
        (msg, isOk) => (isOk ? success(msg) : info(msg)),
        (msg) => error(msg),
      );
    },
    [success, info, error],
  );

  const testGroupDelay = useCallback(
    async (proxyGroup: string) => {
      await useClashStore.getState().testGroupDelay(
        proxyGroup,
        (msg) => success(msg),
        (msg) => error(msg),
      );
    },
    [success, error],
  );

  return {
    refreshOverview,
    changeMode,
    switchProxy,
    testDelay,
    testGroupDelay,
  };
}
