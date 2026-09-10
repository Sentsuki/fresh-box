// CoreInfoGroup.tsx —— 「sing-box Core」标签页的 Core 一栏：版本、数据大小、
// 销毁工作目录。对齐官方客户端 `SettingsView.tsx` 的 Core 设置页。
//
// 三个动作都走 host 命令（`commands::core`），不是直接打 gRPC —— 销毁要先停
// 服务，那个顺序由 Rust 负责，见那边的注释。

import {
  ArrowClockwiseRegular,
  DeleteRegular,
  InfoRegular,
  StorageRegular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { SettingCard, SettingGroup } from "../../components/ui/SettingCard";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../hooks/useToast";
import {
  destroyWorkingDirectory,
  getCoreInfo,
  getWorkingDirectory,
} from "../../services/api";
import { getErrorMessage } from "../../services/tauri";
import { useSingboxStore } from "../../stores/singboxStore";
import { formatBytes } from "../../services/utils";

/** 一次「慢读」的三种状态：读取中 / 读到了 / 读不到。
 *
 * `null` 和「读失败」必须分开：工作目录大小是 daemon 侧递归遍历算出来的，
 * 大目录上要转好一会儿圈，把失败也画成转圈就等于让用户一直等一个永远不会
 * 来的数。 */
type Loaded<T> = T | "unavailable" | null;

function ReadOnlyValue({ value }: { value: Loaded<string> }) {
  if (value === null) return <Spinner size="sm" />;
  if (value === "unavailable") {
    return <span className="text-sm text-(--wb-error)">Unavailable</span>;
  }
  return (
    <span className="text-sm text-(--wb-text-secondary) font-mono">
      {value}
    </span>
  );
}

export function CoreInfoGroup() {
  const toast = useToast();
  // sing-box 跑着的时候不能销毁工作目录（daemon 的硬性前置条件）。这里只是
  // 把按钮停用并说明原因 —— 停服务是用户自己的决定，不由这个按钮顺手代劳。
  const isRunning = useSingboxStore((s) => s.isRunning);

  const [version, setVersion] = useState<Loaded<string>>(null);
  const [directory, setDirectory] = useState<
    Loaded<{ path: string; size: number }>
  >(null);
  const [confirming, setConfirming] = useState(false);
  const [destroying, setDestroying] = useState(false);

  const loadVersion = useCallback(() => {
    setVersion(null);
    getCoreInfo()
      .then((info) => setVersion(info.version))
      .catch(() => setVersion("unavailable"));
  }, []);

  const loadDirectory = useCallback(() => {
    setDirectory(null);
    getWorkingDirectory()
      .then((info) =>
        // specta 把 Rust 的 `f64` 导成 `number | null` —— 非有限值（NaN /
        // Infinity）在 JSON 里就是 null。字节数不该出现这种值，真出现了当
        // 「读不到」处理，总好过把 NaN 喂给 formatBytes 画出一行乱码。
        setDirectory(
          info.size === null
            ? "unavailable"
            : { path: info.path, size: info.size },
        ),
      )
      .catch(() => setDirectory("unavailable"));
  }, []);

  useEffect(() => {
    loadVersion();
    loadDirectory();
  }, [loadVersion, loadDirectory]);

  const handleDestroy = async () => {
    setDestroying(true);
    try {
      await destroyWorkingDirectory();
      setConfirming(false);
      toast.success("Working directory destroyed");
      // 销毁会把目录连同 daemon 缓存一起删掉，两个读数都过期了。
      loadVersion();
      loadDirectory();
    } catch (err) {
      toast.error(`Failed to destroy: ${getErrorMessage(err)}`);
    } finally {
      setDestroying(false);
    }
  };

  return (
    <>
      <SettingGroup title="Core">
        <SettingCard
          icon={<InfoRegular />}
          title="Version"
          description="Version reported by the running sing-box daemon"
          control={<ReadOnlyValue value={version} />}
        />

        <SettingCard
          icon={<StorageRegular />}
          title="Data Size"
          description={
            directory !== null && directory !== "unavailable"
              ? directory.path
              : "Total size of the daemon's working directory"
          }
          control={
            <div className="flex items-center gap-2">
              <ReadOnlyValue
                value={
                  directory === null || directory === "unavailable"
                    ? directory
                    : formatBytes(directory.size)
                }
              />
              <Button
                variant="subtle"
                size="sm"
                icon={<ArrowClockwiseRegular />}
                onClick={loadDirectory}
                disabled={directory === null}
                aria-label="Recalculate data size"
              />
            </div>
          }
        />

        <SettingCard
          icon={<DeleteRegular />}
          title="Destroy"
          description={
            isRunning
              ? "Stop sing-box first — the working directory cannot be destroyed while the core is running."
              : "Delete the daemon's working directory — cached rule-sets, databases and any other core state. This cannot be undone."
          }
          control={
            <Button
              className="bg-(--wb-error) hover:bg-(--wb-error-hover) active:bg-(--wb-error-hover) border-none text-white"
              onClick={() => setConfirming(true)}
              disabled={destroying || isRunning}
            >
              Destroy
            </Button>
          }
        />
      </SettingGroup>

      <Dialog
        isOpen={confirming}
        onClose={() => {
          if (!destroying) setConfirming(false);
        }}
        title="Destroy Working Directory"
        icon={<DeleteRegular />}
        description="This deletes the daemon's working directory and everything in it. This cannot be undone."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={destroying}
            >
              Cancel
            </Button>
            <Button
              className="bg-(--wb-error) hover:bg-(--wb-error-hover) active:bg-(--wb-error-hover) border-none text-white"
              onClick={() => void handleDestroy()}
              loading={destroying}
            >
              Destroy
            </Button>
          </>
        }
      >
        {directory !== null && directory !== "unavailable" && (
          <p className="text-xs text-(--wb-text-secondary) font-mono break-all">
            {directory.path}
          </p>
        )}
      </Dialog>
    </>
  );
}
