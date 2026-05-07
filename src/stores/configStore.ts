import { create } from "zustand";
import type { ConfigFileEntry, SubscriptionRecord } from "../types/app";

interface ConfigState {
  configFiles: ConfigFileEntry[];
  subscriptions: SubscriptionRecord;
  pendingOperation: boolean;
}

interface ConfigActions {
  setConfigFiles: (files: ConfigFileEntry[]) => void;
  setSubscriptions: (subs: SubscriptionRecord) => void;
  setPending: (pending: boolean) => void;
}

export const useConfigStore = create<ConfigState & ConfigActions>((set) => ({
  configFiles: [],
  subscriptions: {},
  pendingOperation: false,
  setConfigFiles: (configFiles) => set({ configFiles }),
  setSubscriptions: (subscriptions) => set({ subscriptions }),
  setPending: (pendingOperation) => set({ pendingOperation }),
}));
