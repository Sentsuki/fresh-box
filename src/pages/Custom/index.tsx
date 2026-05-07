import { useState, useEffect } from "react";
import { AddRegular, DeleteRegular, SaveRegular, InfoRegular } from "@fluentui/react-icons";
import { Button } from "../../components/ui/Button";
import { Section } from "../../components/ui/Section";
import { useToast } from "../../hooks/useToast";
import { usePriorityConfig, STACK_OPTIONS, LOG_LEVELS } from "../../hooks/usePriorityConfig";
import {
  loadConfigOverride,
  saveConfigOverride,
  clearConfigOverride,
  enableConfigOverride,
  disableConfigOverride,
  isConfigOverrideEnabled,
} from "../../services/api";
import type { ConfigOverride, StackOption, LogLevel } from "../../types/app";

interface OverrideEntry {
  key: string;
  value: string;
}

export default function Custom() {
  const toast = useToast();
  const [overrides, setOverrides] = useState<OverrideEntry[]>([]);
  const [rawJson, setRawJson] = useState("");
  const [useRaw, setUseRaw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [togglingOverride, setTogglingOverride] = useState(false);

  const {
    isLoading: isPriorityLoading,
    hasStackField,
    hasLogField,
    selectedStack,
    logDisabled,
    setLogDisabled,
    selectedLogLevel,
    setSelectedLogLevel,
    loadConfiguration,
    setStackOption,
    updateLogConfiguration,
  } = usePriorityConfig();

  useEffect(() => {
    void Promise.all([
      loadConfigOverride().then((raw) => {
        if (raw && Object.keys(raw).length > 0) {
          setRawJson(JSON.stringify(raw, null, 2));
          setOverrides(
            Object.entries(raw).map(([key, value]) => ({
              key,
              value: typeof value === "string" ? value : JSON.stringify(value),
            })),
          );
        }
      }),
      isConfigOverrideEnabled().then(setOverrideEnabled),
      loadConfiguration(),
    ]).catch(() => {});
  }, [loadConfiguration]);

  const addEntry = () => {
    setOverrides((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeEntry = (i: number) => {
    setOverrides((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateEntry = (i: number, field: "key" | "value", val: string) => {
    setOverrides((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)),
    );
  };

  const toggleOverrideEnabled = async () => {
    setTogglingOverride(true);
    try {
      if (overrideEnabled) {
        await disableConfigOverride();
        setOverrideEnabled(false);
        toast.success("Config override disabled");
      } else {
        await enableConfigOverride();
        setOverrideEnabled(true);
        toast.success("Config override enabled");
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTogglingOverride(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let payload: ConfigOverride;
      if (useRaw) {
        payload = JSON.parse(rawJson) as ConfigOverride;
      } else {
        const obj: ConfigOverride = {};
        for (const entry of overrides) {
          if (!entry.key.trim()) continue;
          try {
            obj[entry.key] = JSON.parse(entry.value) as unknown;
          } catch {
            obj[entry.key] = entry.value;
          }
        }
        payload = obj;
      }
      await saveConfigOverride(payload);
      toast.success("Config overrides saved");
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClearOverride = async () => {
    try {
      await clearConfigOverride();
      setOverrides([]);
      setRawJson("");
      toast.success("Config override cleared");
    } catch (err) {
      toast.error(`Failed to clear: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-[var(--wb-text-primary)]">Custom</h1>
        <p className="text-sm text-[var(--wb-text-secondary)] mt-0.5">
          Override sing-box configuration fields
        </p>
      </div>

      {/* Priority Config Section */}
      {(hasStackField || hasLogField) && (
        <Section title="Priority Configuration">
          {isPriorityLoading ? (
            <p className="text-sm text-[var(--wb-text-secondary)]">Loading...</p>
          ) : (
            <div className="flex flex-col gap-4">
              {hasStackField && (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-[var(--wb-text-primary)]">TUN Stack</p>
                    <p className="text-xs text-[var(--wb-text-secondary)] mt-0.5">Network stack for TUN interface</p>
                  </div>
                  <select
                    value={selectedStack}
                    onChange={(e) => void setStackOption(e.target.value as StackOption)}
                    className="px-2 py-1 text-sm rounded-[var(--wb-radius-md)] border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] text-[var(--wb-text-primary)] outline-none focus:border-[var(--wb-accent)]"
                  >
                    {STACK_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              )}
              {hasLogField && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-[var(--wb-text-primary)]">Log Configuration</p>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-[var(--wb-text-secondary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={logDisabled}
                        onChange={(e) => setLogDisabled(e.target.checked)}
                        className="accent-[var(--wb-accent)]"
                      />
                      Disable logs
                    </label>
                    <select
                      value={selectedLogLevel}
                      onChange={(e) => setSelectedLogLevel(e.target.value as LogLevel)}
                      disabled={logDisabled}
                      className="px-2 py-1 text-sm rounded-[var(--wb-radius-md)] border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] text-[var(--wb-text-primary)] outline-none focus:border-[var(--wb-accent)] disabled:opacity-50"
                    >
                      {LOG_LEVELS.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => void updateLogConfiguration(logDisabled, selectedLogLevel)}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {/* Config Override Section */}
      <div className="flex items-center gap-3 p-3 rounded-[var(--wb-radius-md)] border border-[var(--wb-border-subtle)] bg-[var(--wb-surface-layer)]">
        <InfoRegular className="text-[var(--wb-accent)] flex-shrink-0" />
        <p className="text-xs text-[var(--wb-text-secondary)] flex-1">
          These overrides are merged into the selected config file at startup.
        </p>
        <button
          onClick={() => void toggleOverrideEnabled()}
          disabled={togglingOverride}
          className={[
            "flex-shrink-0 px-3 py-1 text-sm rounded-[var(--wb-radius-md)] border transition-colors",
            overrideEnabled
              ? "border-[var(--wb-accent)] bg-[var(--wb-accent)] text-white"
              : "border-[var(--wb-border-default)] text-[var(--wb-text-secondary)] hover:border-[var(--wb-border-default)]",
          ].join(" ")}
        >
          {togglingOverride ? "..." : overrideEnabled ? "Enabled" : "Disabled"}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setUseRaw(false)}
          className={[
            "px-3 py-1 text-sm rounded-[var(--wb-radius-md)] transition-colors",
            !useRaw
              ? "bg-[var(--wb-accent)] text-white"
              : "text-[var(--wb-text-secondary)] hover:bg-[var(--wb-surface-hover)]",
          ].join(" ")}
        >
          Fields
        </button>
        <button
          onClick={() => setUseRaw(true)}
          className={[
            "px-3 py-1 text-sm rounded-[var(--wb-radius-md)] transition-colors",
            useRaw
              ? "bg-[var(--wb-accent)] text-white"
              : "text-[var(--wb-text-secondary)] hover:bg-[var(--wb-surface-hover)]",
          ].join(" ")}
        >
          Raw JSON
        </button>
      </div>

      {useRaw ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            className="w-full h-64 font-mono text-xs p-3 rounded-[var(--wb-radius-md)] border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] text-[var(--wb-text-primary)] resize-y outline-none focus:border-[var(--wb-accent)]"
            placeholder='{ "experimental": { "clash_api": { "external_ui": "" } } }'
            spellCheck={false}
          />
        </div>
      ) : (
        <Section
          title="Override Fields"
          actions={
            <Button icon={<AddRegular />} size="sm" variant="subtle" onClick={addEntry}>
              Add
            </Button>
          }
        >
          {overrides.length === 0 ? (
            <p className="text-sm text-[var(--wb-text-secondary)] px-1">
              No overrides defined. Click Add to add a field override.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {overrides.map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={entry.key}
                    onChange={(e) => updateEntry(i, "key", e.target.value)}
                    placeholder="Field path (e.g. log.level)"
                    className="flex-1 px-2 py-1.5 text-sm rounded-[var(--wb-radius-md)] border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] text-[var(--wb-text-primary)] outline-none focus:border-[var(--wb-accent)]"
                  />
                  <input
                    value={entry.value}
                    onChange={(e) => updateEntry(i, "value", e.target.value)}
                    placeholder="Value (JSON or string)"
                    className="flex-1 px-2 py-1.5 text-sm rounded-[var(--wb-radius-md)] border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] text-[var(--wb-text-primary)] outline-none focus:border-[var(--wb-accent)]"
                  />
                  <button
                    onClick={() => removeEntry(i)}
                    className="p-1.5 text-[var(--wb-text-secondary)] hover:text-[var(--wb-error)] transition-colors rounded"
                  >
                    <DeleteRegular />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="subtle"
          onClick={() => void handleClearOverride()}
        >
          Clear
        </Button>
        <Button
          variant="accent"
          icon={<SaveRegular />}
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? "Saving..." : "Save Overrides"}
        </Button>
      </div>
    </div>
  );
}
