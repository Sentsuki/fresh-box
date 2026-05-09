import { useCallback, useMemo } from "react";
import { create } from "zustand";
import {
  getClashRules,
} from "../services/api";
import type { RuleEntry } from "../types/app";
import { useSettingsStore } from "../stores/settingsStore";
import { useToast } from "./useToast";

interface RulesState {
  rules: RuleEntry[];
  search: string;
  isRefreshing: boolean;
  errorMessage: string | null;
  setSearch: (s: string) => void;
}

export const useRulesStore = create<RulesState>((set) => ({
  rules: [],
  search: "",
  isRefreshing: false,
  errorMessage: null,
  setSearch: (search) => set({ search }),
}));

function matchesRuleSearch(rule: RuleEntry, filter: string): boolean {
  if (!filter.trim()) return true;
  const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${rule.type} ${rule.payload} ${rule.proxy}`.toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

export function useRulesPage() {
  const store = useRulesStore();
  const currentTab = useSettingsStore((s) => s.settings.rules.current_tab);
  const setCurrentTab = useSettingsStore((s) => s.setRulesTab);

  const { error } = useToast();

  const visibleRules = useMemo(
    () => store.rules.filter((rule) => matchesRuleSearch(rule, store.search)),
    [store.rules, store.search],
  );

  const refreshRules = useCallback(
    async (showToastOnError = false) => {
      if (useRulesStore.getState().isRefreshing) return;
      useRulesStore.setState({ isRefreshing: true });
      try {
        const snapshot = await getClashRules();
        useRulesStore.setState({
          rules: [...snapshot.rules],
          errorMessage: null,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load rules";
        useRulesStore.setState({ errorMessage: message });
        if (showToastOnError) error(`Failed to load rules: ${message}`);
      } finally {
        useRulesStore.setState({ isRefreshing: false });
      }
    },
    [error],
  );

  return {
    ...store,
    visibleRules,
    currentTab,
    setCurrentTab,
    refreshRules,
  };
}
