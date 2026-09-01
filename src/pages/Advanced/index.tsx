import { SaveRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Switch } from "../../components/ui/Switch";
import { PageHeader } from "../../components/ui/PageHeader";
import { useToast } from "../../hooks/useToast";
import {
  clearConfigOverride,
  disableConfigOverride,
  enableConfigOverride,
  isConfigOverrideEnabled,
  loadConfigOverride,
  saveConfigOverride,
} from "../../services/api";
import type { ConfigOverride } from "../../types/app";

export default function Advanced() {
  const toast = useToast();

  // Config Override State
  const [rawJson, setRawJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [togglingOverride, setTogglingOverride] = useState(false);

  useEffect(() => {
    void Promise.all([
      loadConfigOverride().then((raw) => {
        if (raw && Object.keys(raw).length > 0) {
          setRawJson(JSON.stringify(raw, null, 2));
        }
      }),
      isConfigOverrideEnabled().then(setOverrideEnabled),
    ]).catch(() => {});
  }, []);

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
      toast.error(
        `Failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setTogglingOverride(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let payload: ConfigOverride = {};
      if (rawJson.trim()) {
        payload = JSON.parse(rawJson) as ConfigOverride;
      }
      await saveConfigOverride(payload);
      toast.success("Config overrides saved");
    } catch (err) {
      toast.error(
        `Failed to save: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClearOverride = async () => {
    try {
      await clearConfigOverride();
      setRawJson("");
      toast.success("Config override cleared");
    } catch (err) {
      toast.error(
        `Failed to clear: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden pr-2 pb-10">
      <PageHeader
        title="Advanced"
        description="Write custom JSON rules to override the active sing-box configuration."
      />

      <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar mt-6">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={overrideEnabled}
                onCheckedChange={() => void toggleOverrideEnabled()}
                disabled={togglingOverride}
                label="Inject Overrides"
              />
              {togglingOverride && (
                <span className="text-xs text-(--wb-text-secondary)">...</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="subtle" onClick={() => void handleClearOverride()}>
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

          <div className="bg-(--wb-surface-layer) rounded-(--wb-radius-lg) border border-(--wb-border-subtle) shadow-sm overflow-hidden flex-1 min-h-[400px]">
            <textarea
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              className="w-full h-full min-h-[400px] font-mono text-sm p-4 bg-transparent text-(--wb-text-primary) resize-y outline-none"
              placeholder="{...}"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
