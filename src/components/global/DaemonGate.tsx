import type { ReactNode } from "react";
import {
  installDaemonService,
  repairDaemonService,
  retryDaemonConnection,
  takeOverDaemon,
} from "../../services/api";
import { getErrorMessage } from "../../services/tauri";
import { useSingboxStore } from "../../stores/singboxStore";
import { useToast } from "../../hooks/useToast";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import type {
  DaemonConnectionPhase,
  DaemonPhaseName,
} from "../../types/daemon";

/**
 * daemon 连接相位的唯一闸门。
 *
 * 这是审计项 H-01 的结构性修复。后端一直把 7 个相位建模得很清楚并推给前端，
 * 但**没有任何组件读它** —— `connectionPhase` 写进 store 就没人管了，于是
 * 「服务没装」「版本不匹配」「被别的用户占着」「服务停了」全都塌缩成 Overview
 * 上一个不亮的盾牌图标，用户看不到发生了什么，也没有对症的按钮。
 *
 * 修法不是「这次把相位补上」，而是让**漏掉相位不再可能**：下面这张
 * `Record<DaemonPhaseName, ...>` 表少一项就是 TS 编译错误。以后 Rust 侧加一个
 * 相位，前端不处理就构建不过。
 */

interface PhaseView {
  title: string;
  /** 说明文字。拿到相位本身，好把版本号、原始错误这类细节展开。 */
  describe: (phase: DaemonConnectionPhase) => string;
  action?: {
    label: string;
    /** 会弹 UAC 的动作标出来，按钮上提示一下，用户不会被突然的提权吓到。 */
    elevated?: boolean;
    /** 生成的命令对 Rust 的 `()` 返回 `Promise<null>`，这里只关心它完成。 */
    run: () => Promise<unknown>;
  };
  /** `true` = 这个相位下正常渲染页面内容，不拦。 */
  passthrough?: boolean;
  busy?: boolean;
}

const VIEWS: Record<DaemonPhaseName, PhaseView> = {
  connecting: {
    title: "Connecting to sing-box-daemon…",
    describe: () => "Establishing the connection to the background service.",
    busy: true,
  },
  connected: {
    title: "",
    describe: () => "",
    passthrough: true,
  },
  "not-installed": {
    title: "The sing-box-daemon service isn't installed",
    describe: () =>
      "fresh-box needs a Windows service to run sing-box with the privileges a TUN interface requires. Installing it asks for administrator approval once.",
    action: {
      label: "Install service",
      elevated: true,
      run: installDaemonService,
    },
  },
  "not-running": {
    title: "The sing-box-daemon service is stopped",
    describe: () =>
      "The service is installed but not currently running — something stopped it, or it crashed and didn't come back. Starting it again asks for administrator approval.",
    action: {
      label: "Start service",
      elevated: true,
      run: repairDaemonService,
    },
  },
  "version-mismatch": {
    title: "The running service is a different version",
    describe: (phase) =>
      phase.phase === "version-mismatch"
        ? `The service reports ${phase.daemonVersion}, but this install ships ${phase.bundledVersion}. That usually means fresh-box was updated while the service wasn't. Reinstalling the service brings them back in step.`
        : "",
    action: {
      label: "Reinstall service",
      elevated: true,
      run: installDaemonService,
    },
  },
  "owned-by-other-user": {
    title: "Another Windows user is using sing-box",
    describe: () =>
      "The daemon is currently claimed by a different user session. You can take it over — that user's sing-box instance will stop.",
    action: {
      label: "Take over",
      run: takeOverDaemon,
    },
  },
  unavailable: {
    title: "Can't reach sing-box-daemon",
    describe: (phase) =>
      phase.phase === "unavailable" && phase.errorMessage
        ? phase.errorMessage
        : "The connection to the background service failed for an unknown reason.",
    action: {
      label: "Retry now",
      run: retryDaemonConnection,
    },
  },
};

export function DaemonGate({ children }: { children: ReactNode }) {
  const phase = useSingboxStore((s) => s.connectionPhase);
  const { error } = useToast();
  const view = VIEWS[phase.phase];

  if (view.passthrough) return <>{children}</>;

  const run = async () => {
    if (!view.action) return;
    try {
      await view.action.run();
    } catch (err) {
      error(getErrorMessage(err));
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        {view.busy && <Spinner size="lg" />}
        <h2 className="text-lg font-semibold text-(--wb-text-primary)">
          {view.title}
        </h2>
        <p className="text-sm leading-relaxed text-(--wb-text-secondary)">
          {view.describe(phase)}
        </p>
        {view.action && (
          <div className="flex flex-col items-center gap-2">
            <Button onClick={() => void run()}>{view.action.label}</Button>
            {view.action.elevated && (
              <span className="text-xs text-(--wb-text-tertiary)">
                Requires administrator approval
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
