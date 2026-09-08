import { PlayRegular, StopRegular } from "@fluentui/react-icons";
import { useEffect, useRef, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { KeyValue } from "../../components/ui/KeyValue";
import { Section } from "../../components/ui/Section";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import { useSingboxStore } from "../../stores/singboxStore";
import { useProxyStore } from "../../stores/proxyStore";
import { runNetworkQualityTest, runStunTest } from "../../daemon/toolStreams";
import {
  accuracyLabel,
  accuracyVariant,
  formatBitrate,
  natFilteringLabel,
  natMappingLabel,
  natBehaviorVariant,
} from "../../services/format";
import {
} from "../../services/api";
import { NETWORK_QUALITY_PHASE } from "../../types/app";
import type { NetworkQualityProgress, StunTestProgress } from "../../types/app";

const NETWORK_QUALITY_DEFAULT_URL =
  "https://mensura.cdn-apple.com/api/v1/gm/config";
const STUN_DEFAULT_SERVER = "stun.voipgate.com:3478";
const MAX_RUNTIME_OPTIONS = [20, 30, 60];

/** Every outbound tag currently offered by the running config's proxy
 * groups — good enough as an "outbound picker" without a dedicated
 * `SubscribeOutbounds` call fresh-box doesn't wire up. Picking a selector
 * group's own tag tests through whatever it currently has selected. */
function useOutboundTags(): string[] {
  const overview = useProxyStore((s) => s.overview);
  const tags = new Set<string>();
  for (const group of overview?.proxy_groups ?? []) {
    tags.add(group.name);
  }
  return Array.from(tags);
}

function OutboundPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const tags = useOutboundTags();
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="">Default outbound</option>
      {tags.map((tag) => (
        <option key={tag} value={tag}>
          {tag}
        </option>
      ))}
    </Select>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-(--wb-text-secondary)">
        {label}
      </span>
      {children}
    </label>
  );
}

export function NetworkQualityCard() {
  const isRunning = useSingboxStore((s) => s.isRunning);
  const [configURL, setConfigURL] = useState(NETWORK_QUALITY_DEFAULT_URL);
  const [outboundTag, setOutboundTag] = useState("");
  const [serial, setSerial] = useState(false);
  const [http3, setHttp3] = useState(false);
  const [maxRuntimeSeconds, setMaxRuntimeSeconds] = useState(20);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<NetworkQualityProgress | null>(null);
  // 取消 = abort 这个 signal，流随之关闭。不再需要一个单独的 cancel 命令，
  // 也不需要 Rust 侧维护「当前这次测试」的任务槽位。
  const abortRef = useRef<AbortController | null>(null);

  // 组件卸载时收掉还在跑的测试，免得流一直挂着。
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    setProgress(null);
    setRunning(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await runNetworkQualityTest(
        { configURL, outboundTag, serial, http3, maxRuntimeSeconds },
        setProgress,
        controller.signal,
      );
      setRunning(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      setRunning(false);
      setProgress({
        phase: NETWORK_QUALITY_PHASE.done,
        downloadCapacity: 0,
        uploadCapacity: 0,
        downloadRPM: 0,
        uploadRPM: 0,
        idleLatencyMs: 0,
        elapsedMs: 0,
        isFinal: true,
        error: err instanceof Error ? err.message : String(err),
        downloadCapacityAccuracy: 0,
        uploadCapacityAccuracy: 0,
        downloadRPMAccuracy: 0,
        uploadRPMAccuracy: 0,
      });
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const finished = progress?.isFinal ?? false;
  const phase = progress?.phase ?? NETWORK_QUALITY_PHASE.idle;

  return (
    <Section
      title="Network Quality"
      description="Measures idle latency, download/upload capacity and responsiveness (RPM) through a chosen outbound."
    >
      <div className="flex flex-col gap-4 p-4 rounded-(--wb-radius-lg) border border-(--wb-border-subtle) bg-(--wb-surface-layer)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Configuration URL">
            <input
              className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) disabled:opacity-50"
              value={configURL}
              onChange={(e) => setConfigURL(e.target.value)}
              disabled={running}
              spellCheck={false}
            />
          </Field>
          <Field label="Outbound">
            <OutboundPicker
              value={outboundTag}
              onChange={setOutboundTag}
              disabled={running}
            />
          </Field>
          <Field label="Max runtime">
            <Select
              value={maxRuntimeSeconds}
              onChange={(e) => setMaxRuntimeSeconds(Number(e.target.value))}
              disabled={running}
            >
              {MAX_RUNTIME_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} seconds
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center gap-6 pt-5">
            <Switch
              checked={serial}
              onCheckedChange={setSerial}
              label="Serial"
              disabled={running}
            />
            <Switch
              checked={http3}
              onCheckedChange={setHttp3}
              label="HTTP/3"
              disabled={running}
            />
          </div>
        </div>

        <div>
          {running ? (
            <Button
              variant="subtle"
              icon={<StopRegular />}
              onClick={() => void stop()}
            >
              Cancel test
            </Button>
          ) : (
            <Button
              variant="accent"
              icon={<PlayRegular />}
              onClick={() => void start()}
              disabled={!isRunning}
            >
              Start test
            </Button>
          )}
          {!isRunning && (
            <span className="ml-3 text-xs text-(--wb-text-tertiary)">
              sing-box must be running to test through an outbound.
            </span>
          )}
        </div>

        {progress && (
          <div className="flex flex-col gap-2 pt-2 border-t border-(--wb-border-subtle)">
            {progress.error && (
              <p className="text-xs text-(--wb-error)">{progress.error}</p>
            )}
            <KeyValue
              label="Idle latency"
              value={
                progress.idleLatencyMs > 0
                  ? `${progress.idleLatencyMs} ms`
                  : "-"
              }
            />
            <KeyValue
              label="Download"
              value={
                <span className="inline-flex items-center gap-1.5">
                  {running &&
                    !finished &&
                    phase === NETWORK_QUALITY_PHASE.download &&
                    "…"}
                  {progress.downloadCapacity > 0
                    ? formatBitrate(progress.downloadCapacity)
                    : "-"}
                  {finished && progress.downloadCapacity > 0 && (
                    <Badge
                      variant={accuracyVariant(
                        progress.downloadCapacityAccuracy,
                      )}
                    >
                      {accuracyLabel(progress.downloadCapacityAccuracy)}
                    </Badge>
                  )}
                </span>
              }
            />
            <KeyValue
              label="Upload"
              value={
                <span className="inline-flex items-center gap-1.5">
                  {running &&
                    !finished &&
                    phase === NETWORK_QUALITY_PHASE.upload &&
                    "…"}
                  {progress.uploadCapacity > 0
                    ? formatBitrate(progress.uploadCapacity)
                    : "-"}
                  {finished && progress.uploadCapacity > 0 && (
                    <Badge
                      variant={accuracyVariant(progress.uploadCapacityAccuracy)}
                    >
                      {accuracyLabel(progress.uploadCapacityAccuracy)}
                    </Badge>
                  )}
                </span>
              }
            />
            <KeyValue
              label="Download RPM"
              value={
                <span className="inline-flex items-center gap-1.5">
                  {progress.downloadRPM > 0
                    ? String(progress.downloadRPM)
                    : "-"}
                  {finished && progress.downloadRPM > 0 && (
                    <Badge
                      variant={accuracyVariant(progress.downloadRPMAccuracy)}
                    >
                      {accuracyLabel(progress.downloadRPMAccuracy)}
                    </Badge>
                  )}
                </span>
              }
            />
            <KeyValue
              label="Upload RPM"
              value={
                <span className="inline-flex items-center gap-1.5">
                  {progress.uploadRPM > 0 ? String(progress.uploadRPM) : "-"}
                  {finished && progress.uploadRPM > 0 && (
                    <Badge
                      variant={accuracyVariant(progress.uploadRPMAccuracy)}
                    >
                      {accuracyLabel(progress.uploadRPMAccuracy)}
                    </Badge>
                  )}
                </span>
              }
            />
            {progress.elapsedMs > 0 && (
              <KeyValue
                label="Elapsed"
                value={`${(progress.elapsedMs / 1000).toFixed(1)}s`}
              />
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

export function StunTestCard() {
  const isRunning = useSingboxStore((s) => s.isRunning);
  const [server, setServer] = useState(STUN_DEFAULT_SERVER);
  const [outboundTag, setOutboundTag] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<StunTestProgress | null>(null);
  // 同网络质量测试：取消就是 abort signal。
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    setProgress(null);
    setRunning(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await runStunTest({ server, outboundTag }, setProgress, controller.signal);
      setRunning(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      setRunning(false);
      setProgress({
        phase: 0,
        externalAddr: "",
        latencyMs: 0,
        natMapping: 0,
        natFiltering: 0,
        isFinal: true,
        error: err instanceof Error ? err.message : String(err),
        natTypeSupported: false,
      });
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  return (
    <Section
      title="STUN Test"
      description="Finds your external address and the outbound's NAT mapping/filtering behavior."
    >
      <div className="flex flex-col gap-4 p-4 rounded-(--wb-radius-lg) border border-(--wb-border-subtle) bg-(--wb-surface-layer)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Server">
            <input
              className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) disabled:opacity-50"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              disabled={running}
              spellCheck={false}
            />
          </Field>
          <Field label="Outbound">
            <OutboundPicker
              value={outboundTag}
              onChange={setOutboundTag}
              disabled={running}
            />
          </Field>
        </div>

        <div>
          {running ? (
            <Button
              variant="subtle"
              icon={<StopRegular />}
              onClick={() => void stop()}
            >
              Cancel test
            </Button>
          ) : (
            <Button
              variant="accent"
              icon={<PlayRegular />}
              onClick={() => void start()}
              disabled={!isRunning}
            >
              Start test
            </Button>
          )}
          {!isRunning && (
            <span className="ml-3 text-xs text-(--wb-text-tertiary)">
              sing-box must be running to test through an outbound.
            </span>
          )}
        </div>

        {progress && (
          <div className="flex flex-col gap-2 pt-2 border-t border-(--wb-border-subtle)">
            {progress.error && (
              <p className="text-xs text-(--wb-error)">{progress.error}</p>
            )}
            <KeyValue
              label="External address"
              value={progress.externalAddr || "-"}
            />
            <KeyValue
              label="Latency"
              value={progress.latencyMs > 0 ? `${progress.latencyMs} ms` : "-"}
            />
            {progress.isFinal && !progress.natTypeSupported ? (
              <KeyValue
                label="NAT type detection"
                value="Not supported by server"
              />
            ) : (
              <>
                <KeyValue
                  label="NAT mapping"
                  value={
                    progress.natMapping > 0 ? (
                      <Badge
                        variant={natBehaviorVariant(
                          natMappingLabel(progress.natMapping),
                        )}
                      >
                        {natMappingLabel(progress.natMapping)}
                      </Badge>
                    ) : (
                      "-"
                    )
                  }
                />
                <KeyValue
                  label="NAT filtering"
                  value={
                    progress.natFiltering > 0 ? (
                      <Badge
                        variant={natBehaviorVariant(
                          natFilteringLabel(progress.natFiltering),
                        )}
                      >
                        {natFilteringLabel(progress.natFiltering)}
                      </Badge>
                    ) : (
                      "-"
                    )
                  }
                />
              </>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

export default function DiagnosticsTab() {
  return (
    <div className="flex flex-col gap-6">
      <NetworkQualityCard />
      <StunTestCard />
    </div>
  );
}
