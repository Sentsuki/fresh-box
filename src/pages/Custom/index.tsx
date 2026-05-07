import { useState, useEffect } from "react";
import { AddRegular, DeleteRegular, SaveRegular, InfoRegular, CodeRegular } from "@fluentui/react-icons";
import { Button } from "../../components/ui/Button";
import { SettingGroup, SettingCard } from "../../components/ui/SettingCard";
import { PageHeader } from "../../components/ui/PageHeader";
import { useToast } from "../../hooks/useToast";
import {
  loadConfigOverride,
  saveConfigOverride,
  clearConfigOverride,
  enableConfigOverride,
  disableConfigOverride,
  isConfigOverrideEnabled,
} from "../../services/api";
import type { ConfigOverride } from "../../types/app";

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
    ]).catch(() => {});
  }, []);

  const addEntry = () => setOverrides((prev) => [...prev, { key: "", value: "" }]);
  const removeEntry = (i: number) => setOverrides((prev) => prev.filter((_, idx) => idx !== i));
  const updateEntry = (i: number, field: "key" | "value", val: string) =>
    setOverrides((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)));

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
    <div className="flex flex-col h-full overflow-y-auto pr-2 pb-10">
      <PageHeader 
        title="Advanced" 
        description="Write custom JSON rules and fields to override the active sing-box configuration."
      >
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
      </PageHeader>

      <div className="flex flex-col gap-8">
        <SettingGroup>
          <SettingCard
            icon={<CodeRegular />}
            title="Inject Configuration Overrides"
            description="These overrides are directly merged into the JSON payload before starting the sing-box core."
            control={
              <button
                onClick={() => void toggleOverrideEnabled()}
                disabled={togglingOverride}
                className={[
                  "px-4 py-2 text-sm rounded-full font-medium transition-colors border",
                  overrideEnabled
                    ? "bg-(--wb-success) border-(--wb-success) text-white hover:bg-[#5aa33d]"
                    : "bg-transparent border-(--wb-border-default) text-(--wb-text-secondary) hover:bg-(--wb-surface-hover)",
                ].join(" ")}
              >
                {togglingOverride ? "..." : overrideEnabled ? "Injection Enabled" : "Injection Disabled"}
              </button>
            }
          />
        </SettingGroup>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 p-1 bg-(--wb-surface-layer) rounded-(--wb-radius-md) border border-(--wb-border-subtle) w-fit">
            <button
              onClick={() => setUseRaw(false)}
              className={[
                "px-4 py-1.5 text-sm rounded-(--wb-radius-sm) transition-colors font-medium",
                !useRaw
                  ? "bg-(--wb-surface-hover) text-(--wb-text-primary)"
                  : "text-(--wb-text-secondary) hover:text-(--wb-text-primary)",
              ].join(" ")}
            >
              Field Builder
            </button>
            <button
              onClick={() => setUseRaw(true)}
              className={[
                "px-4 py-1.5 text-sm rounded-(--wb-radius-sm) transition-colors font-medium",
                useRaw
                  ? "bg-(--wb-surface-hover) text-(--wb-text-primary)"
                  : "text-(--wb-text-secondary) hover:text-(--wb-text-primary)",
              ].join(" ")}
            >
              Raw JSON
            </button>
          </div>

          <div className="bg-(--wb-surface-layer) rounded-(--wb-radius-lg) border border-(--wb-border-subtle) shadow-sm overflow-hidden">
            {useRaw ? (
              <textarea
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                className="w-full h-[400px] font-mono text-sm p-4 bg-transparent text-(--wb-text-primary) resize-y outline-none"
                placeholder='{\n  "experimental": {\n    "clash_api": {\n      "external_ui": ""\n    }\n  }\n}'
                spellCheck={false}
              />
            ) : (
              <div className="p-4 flex flex-col gap-3">
                <div className="flex justify-end mb-2">
                  <Button icon={<AddRegular />} size="sm" variant="subtle" onClick={addEntry}>
                    Add Field
                  </Button>
                </div>
                {overrides.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-(--wb-text-secondary)">
                    <InfoRegular className="text-4xl mb-3 opacity-50" />
                    <p className="text-sm">No overrides defined.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {overrides.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 group">
                        <input
                          value={entry.key}
                          onChange={(e) => updateEntry(i, "key", e.target.value)}
                          placeholder="Field path (e.g. log.level)"
                          className="w-1/3 px-3 py-2 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
                        />
                        <input
                          value={entry.value}
                          onChange={(e) => updateEntry(i, "value", e.target.value)}
                          placeholder="Value (JSON or string)"
                          className="flex-1 px-3 py-2 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent)"
                        />
                        <button
                          onClick={() => removeEntry(i)}
                          className="p-2 text-(--wb-text-disabled) hover:text-(--wb-error) transition-colors rounded opacity-0 group-hover:opacity-100"
                        >
                          <DeleteRegular className="text-lg" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
