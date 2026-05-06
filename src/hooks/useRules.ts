import { useCallback, useMemo } from "react";
import { create } from "zustand";
import {
  getClashRules,
  toggleClashRule,
  updateClashRuleProvider,
} from "../services/api";
import type { RuleEntry, RuleProviderEntry } from "../types/app";
import { useSettingsStore } from "../stores/settingsStore";
import { useToast } from "./useToast";

interface RulesState {
  rules: RuleEntry[];
  providers: RuleProviderEntry[];
  search: string;
  isRefreshing: boolean;
  errorMessage: string | null;
  activeProviderUpdates: string[];
  activeRuleToggle: string[];
  setSearch: (s: string) => void;
}

export const useRulesStore = create<RulesState>((set) => ({
  rules: [],
  providers: [],
  search: "",
  isRefreshing: false,
  errorMessage: null,
  activeProviderUpdates: [],
  activeRuleToggle: [],
  setSearch: (search) => set({ search }),
}));

function matchesRuleSearch(rule: RuleEntry, filter: string): boolean {
  if (!filter.trim()) return true;
  const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack =
    `${rule.type} ${rule.payload} ${rule.proxy}`.toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

function matchesProviderSearch(
  provider: RuleProviderEntry,
  filter: string,
): boolean {
  if (!filter.trim()) return true;
  const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack =
    `${provider.name} ${provider.behavior} ${provider.vehicleType} ${provider.type}`.toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

export function getRuleToggleKey(rule: RuleEntry, index: number): string {
  return rule.uuid ?? `${index}:${rule.type}:${rule.payload}`;
}

export function useRulesPage() {
  const store = useRulesStore();
  const currentTab = useSettingsStore(
    (s) => s.settings.pages.rules.current_tab,
  );
  const setCurrentTab = useSettingsStore((s) => s.setRulesTab);

  const { success, error } = useToast();

  const visibleRules = useMemo(
    () =>
      store.rules.filter((rule) => matchesRuleSearch(rule, store.search)),
    [store.rules, store.search],
  );

  const visibleProviders = useMemo(
    () =>
      store.providers.filter((p) =>
        matchesProviderSearch(p, store.search),
      ),
    [store.providers, store.search],
  );

  const refreshRules = useCallback(
    async (showToastOnError = false) => {
      if (useRulesStore.getState().isRefreshing) return;
      useRulesStore.setState({ isRefreshing: true });
      try {
        const snapshot = await getClashRules();
        useRulesStore.setState({
          rules: [...snapshot.rules],
          providers: [...snapshot.providers],
          errorMessage: null,
        });
        if (snapshot.providers.length === 0 && currentTab === "providers") {
          await setCurrentTab("rules");
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load rules";
        useRulesStore.setState({ errorMessage: message });
        if (showToastOnError) error(`Failed to load rules: ${message}`);
      } finally {
        useRulesStore.setState({ isRefreshing: false });
      }
    },
    [currentTab, setCurrentTab, error],
  );

  const toggleRule = useCallback(
    async (rule: RuleEntry) => {
      const toggleKey = getRuleToggleKey(rule, rule.index ?? 0);
      const { activeRuleToggle } = useRulesStore.getState();
      if (activeRuleToggle.includes(toggleKey)) return;

      const willDisable = !(rule.extra?.disabled ?? rule.disabled ?? false);
      useRulesStore.setState({
        activeRuleToggle: [...activeRuleToggle, toggleKey],
      });

      try {
        if (!rule.uuid && typeof rule.index !== "number") {
          throw new Error("This rule cannot be toggled by the current core.");
        }
        const snapshot = await toggleClashRule(
          rule.uuid,
          rule.index,
          willDisable,
        );
        useRulesStore.setState({
          rules: [...snapshot.rules],
          providers: [...snapshot.providers],
          errorMessage: null,
        });
        success(`Rule ${willDisable ? "disabled" : "enabled"}`);
      } catch (err) {
        error(
          `Failed to toggle rule: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      } finally {
        useRulesStore.setState((state) => ({
          activeRuleToggle: state.activeRuleToggle.filter(
            (k) => k !== toggleKey,
          ),
        }));
      }
    },
    [success, error],
  );

  const updateProvider = useCallback(
    async (name: string) => {
      const { activeProviderUpdates } = useRulesStore.getState();
      if (activeProviderUpdates.includes(name)) return;

      useRulesStore.setState({
        activeProviderUpdates: [...activeProviderUpdates, name],
      });
      try {
        const snapshot = await updateClashRuleProvider(name);
        useRulesStore.setState({
          rules: [...snapshot.rules],
          providers: [...snapshot.providers],
          errorMessage: null,
        });
        success(`Provider updated: ${name}`);
      } catch (err) {
        error(
          `Failed to update provider: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      } finally {
        useRulesStore.setState((state) => ({
          activeProviderUpdates: state.activeProviderUpdates.filter(
            (v) => v !== name,
          ),
        }));
      }
    },
    [success, error],
  );

  return {
    ...store,
    visibleRules,
    visibleProviders,
    currentTab,
    setCurrentTab,
    hasProviders: store.providers.length > 0,
    refreshRules,
    toggleRule,
    updateProvider,
    getRuleToggleKey,
  };
}
