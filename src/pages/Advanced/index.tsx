import { useState, useEffect } from "react";
import {
  SaveRegular,
  CodeRegular,
  SearchRegular,
} from "@fluentui/react-icons";
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
  queryDns,
} from "../../services/api";
import type { ConfigOverride } from "../../types/app";

type AdvancedTab = "override" | "dns";

export default function Advanced() {
  const toast = useToast();
  
  const [activeTab, setActiveTab] = useState<AdvancedTab>("override");

  // Config Override State
  const [rawJson, setRawJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [togglingOverride, setTogglingOverride] = useState(false);

  // DNS Query State
  const [dnsDomain, setDnsDomain] = useState("");
  const [dnsType, setDnsType] = useState("A");
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsResult, setDnsResult] = useState<string>("");

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

  const handleDnsQuery = async () => {
    if (!dnsDomain.trim()) {
      toast.error("Please enter a domain");
      return;
    }
    setDnsLoading(true);
    setDnsResult("");
    try {
      const res = await queryDns(dnsDomain.trim(), dnsType);
      setDnsResult(JSON.stringify(res, null, 2));
    } catch (err) {
      toast.error(
        `DNS Query failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      setDnsResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDnsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden pr-2 pb-10">
      <PageHeader
        title="Advanced"
        description="Write custom JSON rules to override the active sing-box configuration, or use advanced tools like DNS query."
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-(--wb-surface-layer) rounded-(--wb-radius-md) border border-(--wb-border-subtle) w-fit shrink-0">
        <button
          onClick={() => setActiveTab("override")}
          className={[
            "px-4 py-1.5 text-sm rounded-(--wb-radius-sm) transition-colors font-medium flex items-center gap-2",
            activeTab === "override"
              ? "bg-(--wb-surface-hover) text-(--wb-text-primary)"
              : "text-(--wb-text-secondary) hover:text-(--wb-text-primary)",
          ].join(" ")}
        >
          <CodeRegular />
          Config Override
        </button>
        <button
          onClick={() => setActiveTab("dns")}
          className={[
            "px-4 py-1.5 text-sm rounded-(--wb-radius-sm) transition-colors font-medium flex items-center gap-2",
            activeTab === "dns"
              ? "bg-(--wb-surface-hover) text-(--wb-text-primary)"
              : "text-(--wb-text-secondary) hover:text-(--wb-text-primary)",
          ].join(" ")}
        >
          <SearchRegular />
          DNS Query
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar mt-6">
        {activeTab === "override" && (
          <div className="flex flex-col gap-6">
            <div className="flex justify-end gap-2">
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
                    {togglingOverride
                      ? "..."
                      : overrideEnabled
                        ? "Injection Enabled"
                        : "Injection Disabled"}
                  </button>
                }
              />
            </SettingGroup>

            <div className="bg-(--wb-surface-layer) rounded-(--wb-radius-lg) border border-(--wb-border-subtle) shadow-sm overflow-hidden flex-1 min-h-[300px]">
              <textarea
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                className="w-full h-full min-h-[300px] font-mono text-sm p-4 bg-transparent text-(--wb-text-primary) resize-y outline-none"
                placeholder='{\n  "experimental": {\n    "clash_api": {\n      "external_ui": ""\n    }\n  }\n}'
                spellCheck={false}
              />
            </div>
          </div>
        )}

        {activeTab === "dns" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-(--wb-text-primary)">DNS Query</h2>
              <p className="text-sm text-(--wb-text-secondary)">Resolve a domain name using the internal DNS router.</p>
            </div>
            
            <div className="flex items-center gap-2">
              <select
                value={dnsType}
                onChange={(e) => setDnsType(e.target.value)}
                className="px-3 py-2 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) focus:ring-1 focus:ring-(--wb-accent)"
              >
                {["A", "AAAA", "MX", "CNAME", "TXT", "NS", "SRV"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                value={dnsDomain}
                onChange={(e) => setDnsDomain(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleDnsQuery() }}
                placeholder="Enter domain name (e.g. google.com)"
                className="flex-1 px-3 py-2 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) focus:ring-1 focus:ring-(--wb-accent)"
              />
              <Button
                variant="accent"
                icon={<SearchRegular />}
                disabled={dnsLoading}
                onClick={() => void handleDnsQuery()}
              >
                {dnsLoading ? "Querying..." : "Query"}
              </Button>
            </div>

            {dnsResult && (
              <div className="bg-(--wb-surface-layer) rounded-(--wb-radius-lg) border border-(--wb-border-subtle) shadow-sm overflow-hidden p-4">
                <pre className="font-mono text-sm text-(--wb-text-primary) whitespace-pre-wrap break-all">
                  {dnsResult}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
