import { computed, readonly, ref } from "vue";
import {
  getClashRules,
  toggleClashRule,
  updateClashRuleProvider,
} from "../services/api";
import type { RuleEntry, RuleProviderEntry, RulesTab } from "../types/app";
import { useAppStore } from "../stores/appStore";
import { toast } from "./useToast";

const rules = ref<RuleEntry[]>([]);
const providers = ref<RuleProviderEntry[]>([]);
const search = ref("");
const isRefreshing = ref(false);
const errorMessage = ref<string | null>(null);
const activeProviderUpdates = ref<string[]>([]);
const activeRuleToggle = ref<string[]>([]);

function matchesRuleSearch(rule: RuleEntry, filter: string) {
  if (!filter.trim()) {
    return true;
  }

  const tokens = filter
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const haystack = `${rule.type} ${rule.payload} ${rule.proxy}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function matchesProviderSearch(provider: RuleProviderEntry, filter: string) {
  if (!filter.trim()) {
    return true;
  }

  const tokens = filter
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const haystack =
    `${provider.name} ${provider.behavior} ${provider.vehicleType} ${provider.type}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function getRuleToggleKey(rule: RuleEntry, index: number) {
  return rule.uuid ?? `${index}:${rule.type}:${rule.payload}`;
}

export function useRulesPage() {
  const appStore = useAppStore();
  const currentTab = computed<RulesTab>({
    get: () => appStore.appSettings.value.pages.rules.current_tab,
    set: (value) => {
      void appStore.updatePageSettings("rules", (settings) => {
        settings.current_tab = value;
      });
    },
  });

  const visibleRules = computed(() =>
    rules.value.filter((rule) => matchesRuleSearch(rule, search.value)),
  );

  const visibleProviders = computed(() =>
    providers.value.filter((provider) => matchesProviderSearch(provider, search.value)),
  );

  const hasProviders = computed(() => providers.value.length > 0);

  async function refreshRules(showToastOnError = false) {
    if (isRefreshing.value) {
      return;
    }

    isRefreshing.value = true;
    try {
      const snapshot = await getClashRules();
      rules.value = [...snapshot.rules];
      providers.value = [...snapshot.providers];
      errorMessage.value = null;

      if (!hasProviders.value && currentTab.value === "providers") {
        currentTab.value = "rules";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load rules";
      errorMessage.value = message;
      if (showToastOnError) {
        toast.error(`Failed to load rules: ${message}`);
      }
    } finally {
      isRefreshing.value = false;
    }
  }

  async function toggleRule(rule: RuleEntry) {
    const toggleKey = getRuleToggleKey(rule, rule.index ?? 0);
    if (activeRuleToggle.value.includes(toggleKey)) {
      return;
    }

    const willDisable = !(rule.extra?.disabled ?? rule.disabled ?? false);
    activeRuleToggle.value = [...activeRuleToggle.value, toggleKey];

    try {
      if (!rule.uuid && typeof rule.index !== "number") {
        throw new Error("This rule cannot be toggled by the current core.");
      }

      const snapshot = await toggleClashRule(rule.uuid, rule.index, willDisable);
      rules.value = [...snapshot.rules];
      providers.value = [...snapshot.providers];
      errorMessage.value = null;
      toast.success(`Rule ${willDisable ? "disabled" : "enabled"}`);
    } catch (error) {
      toast.error(
        `Failed to toggle rule: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      activeRuleToggle.value = activeRuleToggle.value.filter((key) => key !== toggleKey);
    }
  }

  async function updateProvider(name: string) {
    if (activeProviderUpdates.value.includes(name)) {
      return;
    }

    activeProviderUpdates.value = [...activeProviderUpdates.value, name];
    try {
      const snapshot = await updateClashRuleProvider(name);
      rules.value = [...snapshot.rules];
      providers.value = [...snapshot.providers];
      errorMessage.value = null;
      toast.success(`Provider updated: ${name}`);
    } catch (error) {
      toast.error(
        `Failed to update provider: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      activeProviderUpdates.value = activeProviderUpdates.value.filter(
        (value) => value !== name,
      );
    }
  }

  return {
    rules: readonly(rules),
    providers: readonly(providers),
    visibleRules,
    visibleProviders,
    search,
    currentTab,
    hasProviders,
    isRefreshing: readonly(isRefreshing),
    errorMessage: readonly(errorMessage),
    activeProviderUpdates: readonly(activeProviderUpdates),
    activeRuleToggle: readonly(activeRuleToggle),
    refreshRules,
    toggleRule,
    updateProvider,
    getRuleToggleKey,
  };
}
