import { useCallback, useMemo } from "react";
import { create } from 'zustand';
import {
  getClashRules,
  toggleClashRule,
  updateClashRuleProvider,
} from "../services/api";
import type { RuleEntry, RuleProviderEntry, RulesTab } from "../types/app";
import { useAppStore } from "../stores/appStore";
import { toast } from "./useToast";

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
  setSearch: (s) => set({ search: s }),
}));

function matchesRuleSearch(rule: RuleEntry, filter: string) {
  if (!filter.trim()) return true;
  const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${rule.type} ${rule.payload} ${rule.proxy}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function matchesProviderSearch(provider: RuleProviderEntry, filter: string) {
  if (!filter.trim()) return true;
  const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${provider.name} ${provider.behavior} ${provider.vehicleType} ${provider.type}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function getRuleToggleKey(rule: RuleEntry, index: number) {
  return rule.uuid ?? `${index}:${rule.type}:${rule.payload}`;
}

export function useRulesPage() {
  const store = useRulesStore();
  const currentTab = useAppStore((state) => state.appSettings.pages.rules.current_tab);
  const updatePageSettings = useAppStore((state) => state.updatePageSettings);

  const setCurrentTab = useCallback((value: RulesTab) => {
    void updatePageSettings("rules", (settings) => {
      settings.current_tab = value;
    });
  }, [updatePageSettings]);

  const visibleRules = useMemo(() =>
    store.rules.filter((rule) => matchesRuleSearch(rule, store.search)),
    [store.rules, store.search]
  );

  const visibleProviders = useMemo(() =>
    store.providers.filter((provider) => matchesProviderSearch(provider, store.search)),
    [store.providers, store.search]
  );

  const hasProviders = store.providers.length > 0;

  const refreshRules = useCallback(async (showToastOnError = false) => {
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
        setCurrentTab("rules");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load rules";
      useRulesStore.setState({ errorMessage: message });
      if (showToastOnError) toast.error(`Failed to load rules: ${message}`);
    } finally {
      useRulesStore.setState({ isRefreshing: false });
    }
  }, [currentTab, setCurrentTab]);

  const toggleRule = useCallback(async (rule: RuleEntry) => {
    const toggleKey = getRuleToggleKey(rule, rule.index ?? 0);
    const activeRuleToggle = useRulesStore.getState().activeRuleToggle;
    
    if (activeRuleToggle.includes(toggleKey)) return;

    const willDisable = !(rule.extra?.disabled ?? rule.disabled ?? false);
    useRulesStore.setState({ activeRuleToggle: [...activeRuleToggle, toggleKey] });

    try {
      if (!rule.uuid && typeof rule.index !== "number") {
        throw new Error("This rule cannot be toggled by the current core.");
      }

      const snapshot = await toggleClashRule(rule.uuid, rule.index, willDisable);
      useRulesStore.setState({
        rules: [...snapshot.rules],
        providers: [...snapshot.providers],
        errorMessage: null,
      });
      toast.success(`Rule ${willDisable ? "disabled" : "enabled"}`);
    } catch (error) {
      toast.error(`Failed to toggle rule: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      useRulesStore.setState((state) => ({
        activeRuleToggle: state.activeRuleToggle.filter((key) => key !== toggleKey)
      }));
    }
  }, []);

  const updateProvider = useCallback(async (name: string) => {
    const activeProviderUpdates = useRulesStore.getState().activeProviderUpdates;
    if (activeProviderUpdates.includes(name)) return;

    useRulesStore.setState({ activeProviderUpdates: [...activeProviderUpdates, name] });
    try {
      const snapshot = await updateClashRuleProvider(name);
      useRulesStore.setState({
        rules: [...snapshot.rules],
        providers: [...snapshot.providers],
        errorMessage: null,
      });
      toast.success(`Provider updated: ${name}`);
    } catch (error) {
      toast.error(`Failed to update provider: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      useRulesStore.setState((state) => ({
        activeProviderUpdates: state.activeProviderUpdates.filter((value) => value !== name)
      }));
    }
  }, []);

  return {
    ...store,
    visibleRules,
    visibleProviders,
    currentTab,
    setCurrentTab,
    hasProviders,
    refreshRules,
    toggleRule,
    updateProvider,
    getRuleToggleKey,
  };
}
