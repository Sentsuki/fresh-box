import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  checkConfigFields,
  loadPriorityConfig,
  savePriorityConfig,
} from "../services/api";
import { queryKeys } from "../services/queryClient";
import { getErrorMessage } from "../services/tauri";
import { useSettingsStore } from "../stores/settingsStore";
import { useToast } from "./useToast";
import { isLogLevel, type LogLevel, type PriorityConfig } from "../types/app";

const STACK_OPTIONS = ["mixed", "gvisor", "system"] as const;
export type StackOption = (typeof STACK_OPTIONS)[number];

function isStackOption(value: string): value is StackOption {
  return (STACK_OPTIONS as readonly string[]).includes(value);
}

export { STACK_OPTIONS };

/** 页面上要的那几个值：当前配置里有没有这两个字段，以及它们现在的取值。 */
interface PriorityConfigView {
  hasStackField: boolean;
  hasLogField: boolean;
  stack: StackOption;
  logDisabled: boolean;
  logLevel: LogLevel;
}

const NO_FIELDS: PriorityConfigView = {
  hasStackField: false,
  hasLogField: false,
  stack: "mixed",
  logDisabled: false,
  logLevel: "info",
};

export function usePriorityConfig() {
  const selectedProfileId = useSettingsStore(
    (s) => s.settings.profiles.selected_profile_id,
  );
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.priorityConfig(selectedProfileId);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<PriorityConfigView> => {
      if (!selectedProfileId) return NO_FIELDS;
      try {
        const [fieldsCheck, priorityConfig] = await Promise.all([
          checkConfigFields(selectedProfileId),
          loadPriorityConfig(), // backend always returns defaults, never null fields
        ]);
        const stack = priorityConfig.inbounds?.[0]?.stack;
        const level = priorityConfig.log?.level;
        return {
          hasStackField: fieldsCheck.has_stack_field,
          hasLogField: fieldsCheck.has_log_field,
          stack: stack && isStackOption(stack) ? stack : NO_FIELDS.stack,
          logDisabled: priorityConfig.log?.disabled ?? false,
          logLevel: level && isLogLevel(level) ? level : NO_FIELDS.logLevel,
        };
      } catch (err) {
        // 读不到就把这一组藏起来，而不是摆出一组不知道真假的默认值。
        toastError(`Failed to load configuration: ${getErrorMessage(err)}`);
        return NO_FIELDS;
      }
    },
  });
  const view = query.data ?? NO_FIELDS;

  /**
   * 写一部分 priority config。界面先乐观地改成新值；失败时重新读一遍，让
   * 界面回到真实状态，而不是停在一个没存进去的选项上。
   */
  const update = useMutation({
    mutationFn: async ({
      partial,
    }: {
      partial: Partial<PriorityConfig>;
      optimistic: Partial<PriorityConfigView>;
      message: string;
      errorPrefix: string;
    }) => {
      const current = await loadPriorityConfig();
      await savePriorityConfig({ ...current, ...partial });
    },
    onMutate: ({ optimistic }) => {
      queryClient.setQueryData<PriorityConfigView>(
        queryKey,
        (old) => old && { ...old, ...optimistic },
      );
    },
    onSuccess: (_, { message }) => success(message),
    onError: (err, { errorPrefix }) => {
      toastError(`${errorPrefix}: ${getErrorMessage(err)}`);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const setStackOption = (option: StackOption) => {
    if (!view.hasStackField) return;
    update.mutate({
      partial: { inbounds: [{ stack: option }] },
      optimistic: { stack: option },
      message: `Stack option updated to: ${option}`,
      errorPrefix: "Failed to update stack",
    });
  };

  const setLogConfiguration = (disabled: boolean, level: LogLevel) => {
    if (!view.hasLogField) return;
    update.mutate({
      partial: { log: { disabled, level } },
      optimistic: { logDisabled: disabled, logLevel: level },
      message: `Log updated: level=${level}, disabled=${String(disabled)}`,
      errorPrefix: "Failed to update log config",
    });
  };

  return {
    isLoading: query.isPending,
    hasStackField: view.hasStackField,
    hasLogField: view.hasLogField,
    selectedStack: view.stack,
    logDisabled: view.logDisabled,
    selectedLogLevel: view.logLevel,
    setStackOption,
    setLogConfiguration,
  };
}
