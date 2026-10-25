import { PlayRegular, StopRegular } from "@fluentui/react-icons";
import { useEffect, useRef, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { KeyValue } from "../../components/ui/KeyValue";
import { Card } from "../../components/ui/Card";
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
import { NETWORK_QUALITY_PHASE } from "../../types/app";
import type { NetworkQualityProgress, StunTestProgress } from "../../types/app";
import { getErrorMessage } from "../../services/tauri";

const NETWORK_QUALITY_DEFAULT_URL =
  "https://mensura.cdn-apple.com/api/v1/gm/config";
const STUN_DEFAULT_SERVER = "stun.voipgate.com:3478";
const MAX_RUNTIME_OPTIONS = [20, 30, 60].map((seconds) => ({
  value: seconds,
  label: `${seconds} seconds`,
}));

/**
 * 一次可取消的流式测试：开始、取消、跟随进度。
 *
 * 取消 = abort 这个 signal，流随之关闭。不再需要一个单独的 cancel 命令，也
 * 不需要 Rust 侧维护「当前这次测试」的任务槽位。出错时合成一条「已结束且带
 * 错误」的进度（`failed` 负责填其余字段），界面按同一套逻辑把错误显示出来。
 */
function useStreamingTest<P>(
  run: (
    onProgress: (progress: P) => void,
    signal: AbortSignal,
  ) => Promise<void>,
  failed: (error: string) => P,
) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<P | null>(null);
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
      await run(setProgress, controller.signal);
      setRunning(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      setRunning(false);
      setProgress(failed(getErrorMessage(err)));
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  return { running, progress, start, stop };
}

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

/**
 * 出站选择。没有跑着的实例时测试走 `StartStandalone*Test`，那条 RPC 压根没有
 * 出站参数 —— 所以那时直接禁用，比留着一个不起作用的选项诚实。
 */
function OutboundPicker({
  value,
  onChange,
  testRunning,
}: {
  value: string;
  onChange: (value: string) => void;
  testRunning: boolean;
}) {
  const isRunning = useSingboxStore((s) => s.isRunning);
  const tags = useOutboundTags();
  const options = [
    { value: "", label: "Default outbound" },
    ...tags.map((tag) => ({ value: tag, label: tag })),
  ];
  return (
    <Select
      value={value}
      onValueChange={onChange}
      options={options}
      disabled={testRunning || !isRunning}
    />
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

function TextInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <input
      className="px-3 py-1.5 text-sm rounded-(--wb-radius-md) border border-(--wb-border-default) bg-(--wb-surface-base) text-(--wb-text-primary) outline-none focus:border-(--wb-accent) disabled:opacity-50"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      spellCheck={false}
    />
  );
}

/** 开始/取消按钮，以及 sing-box 没在跑时「测的是直连」的说明。 */
function TestControls({
  running,
  onStart,
  onStop,
}: {
  running: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const isRunning = useSingboxStore((s) => s.isRunning);
  return (
    <div>
      {running ? (
        <Button variant="subtle" icon={<StopRegular />} onClick={onStop}>
          Cancel test
        </Button>
      ) : (
        <Button variant="accent" icon={<PlayRegular />} onClick={onStart}>
          Start test
        </Button>
      )}
      {!isRunning && (
        <span className="ml-3 text-xs text-(--wb-text-tertiary)">
          sing-box isn&apos;t running — this measures the direct connection, not
          an outbound.
        </span>
      )}
    </div>
  );
}

/** 结果区的外框：出错时先把错误摆在最上面。 */
function Results({
  error,
  children,
}: {
  error: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-(--wb-border-subtle)">
      {error && <p className="text-xs text-(--wb-error)">{error}</p>}
      {children}
    </div>
  );
}

/**
 * 一项带精度的测量值。还在测这一项时前面带个省略号；测完才给精度徽章 ——
 * 中途的精度没有意义。
 */
function AccuracyMetric({
  label,
  value,
  format,
  accuracy,
  finished,
  measuring = false,
}: {
  label: string;
  value: number;
  format: (value: number) => string;
  accuracy: number;
  finished: boolean;
  measuring?: boolean;
}) {
  return (
    <KeyValue
      label={label}
      value={
        <span className="inline-flex items-center gap-1.5">
          {measuring && "…"}
          {value > 0 ? format(value) : "-"}
          {finished && value > 0 && (
            <Badge variant={accuracyVariant(accuracy)}>
              {accuracyLabel(accuracy)}
            </Badge>
          )}
        </span>
      }
    />
  );
}

/** NAT 映射/过滤行为。`0` 是「还没测出来」。 */
function NatBehavior({
  label,
  value,
  toLabel,
}: {
  label: string;
  value: number;
  toLabel: (value: number) => string;
}) {
  const text = toLabel(value);
  return (
    <KeyValue
      label={label}
      value={
        value > 0 ? (
          <Badge variant={natBehaviorVariant(text)}>{text}</Badge>
        ) : (
          "-"
        )
      }
    />
  );
}

function NetworkQualityCard() {
  const [configURL, setConfigURL] = useState(NETWORK_QUALITY_DEFAULT_URL);
  const [outboundTag, setOutboundTag] = useState("");
  const [serial, setSerial] = useState(false);
  const [http3, setHttp3] = useState(false);
  const [maxRuntimeSeconds, setMaxRuntimeSeconds] = useState(20);

  const { running, progress, start, stop } =
    useStreamingTest<NetworkQualityProgress>(
      (onProgress, signal) =>
        runNetworkQualityTest(
          { configURL, outboundTag, serial, http3, maxRuntimeSeconds },
          onProgress,
          signal,
        ),
      (error) => ({
        phase: NETWORK_QUALITY_PHASE.done,
        downloadCapacity: 0,
        uploadCapacity: 0,
        downloadRPM: 0,
        uploadRPM: 0,
        idleLatencyMs: 0,
        elapsedMs: 0,
        isFinal: true,
        error,
        downloadCapacityAccuracy: 0,
        uploadCapacityAccuracy: 0,
        downloadRPMAccuracy: 0,
        uploadRPMAccuracy: 0,
      }),
    );

  const finished = progress?.isFinal ?? false;
  const phase = progress?.phase ?? NETWORK_QUALITY_PHASE.idle;
  const measuring = (target: number) =>
    running && !finished && phase === target;

  return (
    <Section
      title="Network Quality"
      description="Measures idle latency, download/upload capacity and responsiveness (RPM) through a chosen outbound."
    >
      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Configuration URL">
            <TextInput
              value={configURL}
              onChange={setConfigURL}
              disabled={running}
            />
          </Field>
          <Field label="Outbound">
            <OutboundPicker
              value={outboundTag}
              onChange={setOutboundTag}
              testRunning={running}
            />
          </Field>
          <Field label="Max runtime">
            <Select
              value={maxRuntimeSeconds}
              onValueChange={setMaxRuntimeSeconds}
              options={MAX_RUNTIME_OPTIONS}
              disabled={running}
            />
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

        <TestControls
          running={running}
          onStart={() => void start()}
          onStop={stop}
        />

        {progress && (
          <Results error={progress.error}>
            <KeyValue
              label="Idle latency"
              value={
                progress.idleLatencyMs > 0
                  ? `${progress.idleLatencyMs} ms`
                  : "-"
              }
            />
            <AccuracyMetric
              label="Download"
              value={progress.downloadCapacity}
              format={formatBitrate}
              accuracy={progress.downloadCapacityAccuracy}
              finished={finished}
              measuring={measuring(NETWORK_QUALITY_PHASE.download)}
            />
            <AccuracyMetric
              label="Upload"
              value={progress.uploadCapacity}
              format={formatBitrate}
              accuracy={progress.uploadCapacityAccuracy}
              finished={finished}
              measuring={measuring(NETWORK_QUALITY_PHASE.upload)}
            />
            <AccuracyMetric
              label="Download RPM"
              value={progress.downloadRPM}
              format={String}
              accuracy={progress.downloadRPMAccuracy}
              finished={finished}
            />
            <AccuracyMetric
              label="Upload RPM"
              value={progress.uploadRPM}
              format={String}
              accuracy={progress.uploadRPMAccuracy}
              finished={finished}
            />
            {progress.elapsedMs > 0 && (
              <KeyValue
                label="Elapsed"
                value={`${(progress.elapsedMs / 1000).toFixed(1)}s`}
              />
            )}
          </Results>
        )}
      </Card>
    </Section>
  );
}

function StunTestCard() {
  const [server, setServer] = useState(STUN_DEFAULT_SERVER);
  const [outboundTag, setOutboundTag] = useState("");

  const { running, progress, start, stop } = useStreamingTest<StunTestProgress>(
    (onProgress, signal) =>
      runStunTest({ server, outboundTag }, onProgress, signal),
    (error) => ({
      phase: 0,
      externalAddr: "",
      latencyMs: 0,
      natMapping: 0,
      natFiltering: 0,
      isFinal: true,
      error,
      natTypeSupported: false,
    }),
  );

  return (
    <Section
      title="STUN Test"
      description="Finds your external address and the outbound's NAT mapping/filtering behavior."
    >
      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Server">
            <TextInput value={server} onChange={setServer} disabled={running} />
          </Field>
          <Field label="Outbound">
            <OutboundPicker
              value={outboundTag}
              onChange={setOutboundTag}
              testRunning={running}
            />
          </Field>
        </div>

        <TestControls
          running={running}
          onStart={() => void start()}
          onStop={stop}
        />

        {progress && (
          <Results error={progress.error}>
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
                <NatBehavior
                  label="NAT mapping"
                  value={progress.natMapping}
                  toLabel={natMappingLabel}
                />
                <NatBehavior
                  label="NAT filtering"
                  value={progress.natFiltering}
                  toLabel={natFilteringLabel}
                />
              </>
            )}
          </Results>
        )}
      </Card>
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
