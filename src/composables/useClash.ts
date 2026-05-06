import { computed, readonly, ref } from "vue";
import {
  getClashOverview,
  selectClashProxy,
  testClashProxyDelay,
  updateClashMode,
} from "../services/api";
import { getErrorMessage } from "../services/tauri";
import type { ClashOverview } from "../types/app";
import { toast } from "./useToast";

const overview = ref<ClashOverview | null>(null);
const errorMessage = ref<string | null>(null);
const isRefreshing = ref(false);
const activeMode = ref<string | null>(null);
const activeSelectionKey = ref<string | null>(null);
const activeDelayNode = ref<string | null>(null);
let requestSequence = 0;

function findDelay(
  nextOverview: ClashOverview | null,
  proxyName: string,
): number | null | undefined {
  return nextOverview?.proxy_groups
    .flatMap((group) => group.options)
    .find((node) => node.name === proxyName)?.delay;
}

export function useClash() {
  async function refreshOverview(showToastOnError = false) {
    const sequence = ++requestSequence;
    isRefreshing.value = true;

    try {
      const nextOverview = await getClashOverview();
      if (sequence === requestSequence) {
        overview.value = nextOverview;
        errorMessage.value = null;
      }
    } catch (error) {
      const message = getErrorMessage(error);
      if (sequence === requestSequence) {
        overview.value = null;
        errorMessage.value = message;
      }
      if (showToastOnError) {
        toast.error(`Failed to load Clash data: ${message}`);
      }
    } finally {
      if (sequence === requestSequence) {
        isRefreshing.value = false;
      }
    }
  }

  function clearOverview() {
    overview.value = null;
    errorMessage.value = null;
    isRefreshing.value = false;
    activeMode.value = null;
    activeSelectionKey.value = null;
    activeDelayNode.value = null;
  }

  async function changeMode(mode: string) {
    if (
      !mode.trim() ||
      activeMode.value === mode ||
      overview.value?.current_mode === mode
    ) {
      return;
    }

    activeMode.value = mode;
    try {
      overview.value = await updateClashMode(mode);
      errorMessage.value = null;
      toast.success(`Clash mode switched to ${mode}`);
    } catch (error) {
      toast.error(`Failed to switch Clash mode: ${getErrorMessage(error)}`);
    } finally {
      activeMode.value = null;
    }
  }

  async function switchProxy(proxyGroup: string, proxyName: string) {
    const actionKey = `${proxyGroup}:${proxyName}`;
    if (activeSelectionKey.value === actionKey) {
      return;
    }

    activeSelectionKey.value = actionKey;
    try {
      overview.value = await selectClashProxy(proxyGroup, proxyName);
      errorMessage.value = null;
      toast.success(`Switched ${proxyGroup} to ${proxyName}`);
    } catch (error) {
      toast.error(`Failed to switch proxy node: ${getErrorMessage(error)}`);
    } finally {
      activeSelectionKey.value = null;
    }
  }

  async function testDelay(proxyName: string) {
    if (activeDelayNode.value === proxyName) {
      return;
    }

    activeDelayNode.value = proxyName;
    try {
      const nextOverview = await testClashProxyDelay(proxyName);
      overview.value = nextOverview;
      errorMessage.value = null;

      const delay = findDelay(nextOverview, proxyName);
      if (typeof delay === "number" && delay >= 0) {
        toast.success(`${proxyName}: ${delay} ms`);
      } else {
        toast.info(`${proxyName}: timeout`);
      }
    } catch (error) {
      toast.error(`Failed to test node latency: ${getErrorMessage(error)}`);
    } finally {
      activeDelayNode.value = null;
    }
  }

  return {
    overview: readonly(overview),
    errorMessage: readonly(errorMessage),
    isRefreshing: readonly(isRefreshing),
    activeMode: readonly(activeMode),
    activeSelectionKey: readonly(activeSelectionKey),
    activeDelayNode: readonly(activeDelayNode),
    hasData: computed(() => overview.value !== null),
    refreshOverview,
    clearOverview,
    changeMode,
    switchProxy,
    testDelay,
  };
}
