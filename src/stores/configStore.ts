import { create } from "zustand";
import type { ProfileEntry } from "../types/app";

interface ConfigState {
  profiles: ProfileEntry[];
  pendingOperation: boolean;
}

interface ConfigActions {
  setProfiles: (profiles: ProfileEntry[]) => void;
  setPending: (pending: boolean) => void;
}

export const useConfigStore = create<ConfigState & ConfigActions>((set) => ({
  profiles: [],
  pendingOperation: false,
  setProfiles: (profiles) => set({ profiles }),
  setPending: (pendingOperation) => set({ pendingOperation }),
}));
