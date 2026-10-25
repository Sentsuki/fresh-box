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
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useState } from "react";
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
import { queryKeys } from "../../services/queryClient";
import { getErrorMessage } from "../../services/tauri";
import { useSingboxStore } from "../../stores/singboxStore";
import { formatBytes } from "../../services/utils";

/** 一次「慢读」的三种显示：读取中转圈 / 读到了 / 读不到。
 *
 * 读失败必须和读取中分开：工作目录大小是 daemon 侧递归遍历算出来的，大目录
 * 上要转好一会儿圈，把失败也画成转圈就等于让用户一直等一个永远不会来的数。 */
function ReadOnlyValue<T>({
  query,
  format,
}: {
  query: UseQueryResult<T>;
  format: (value: T) => string;
}) {
  if (query.isPending || (query.isFetching && query.isError)) {
    return <Spinner size="sm" />;
  }
  if (query.isError) {
    return <span className="text-sm text-(--wb-error)">Unavailable</span>;
  }
  return (
    <span className="text-sm text-(--wb-text-secondary) font-mono">
      {format(query.data)}
    </span>
  );
}

interface WorkingDirectory {
  path: string;
  size: number;
}

export function CoreInfoGroup() {
  const toast = useToast();
  const queryClient = useQueryClient();
  // sing-box 跑着的时候不能销毁工作目录（daemon 的硬性前置条件）。这里只是
  // 把按钮停用并说明原因 —— 停服务是用户自己的决定，不由这个按钮顺手代劳。
  const isRunning = useSingboxStore((s) => s.isRunning);
  const [confirming, setConfirming] = useState(false);

  const version = useQuery({
    queryKey: queryKeys.coreVersion,
    queryFn: async () => (await getCoreInfo()).version,
  });

  const directory = useQuery({
    queryKey: queryKeys.workingDirectory,
    queryFn: async (): Promise<WorkingDirectory> => {
      const info = await getWorkingDirectory();
      // specta 把 Rust 的 `f64` 导成 `number | null` —— 非有限值（NaN /
      // Infinity）在 JSON 里就是 null。字节数不该出现这种值，真出现了当
      // 「读不到」处理，总好过把 NaN 喂给 formatBytes 画出一行乱码。
      if (info.size === null) throw new Error("size unavailable");
      return { path: info.path, size: info.size };
    },
  });

  const destroy = useMutation({
    mutationFn: destroyWorkingDirectory,
    onSuccess: () => {
      setConfirming(false);
      toast.success("Working directory destroyed");
      // 销毁会把目录连同 daemon 缓存一起删掉，两个读数都过期了。
      void queryClient.invalidateQueries({ queryKey: queryKeys.coreVersion });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.workingDirectory,
      });
    },
    onError: (err) => toast.error(`Failed to destroy: ${getErrorMessage(err)}`),
  });
  const destroying = destroy.isPending;

  return (
    <>
      <SettingGroup title="Core">
        <SettingCard
          icon={<InfoRegular />}
          title="Version"
          description="Version reported by the running sing-box daemon"
          control={<ReadOnlyValue query={version} format={(v) => v} />}
        />

        <SettingCard
          icon={<StorageRegular />}
          title="Data Size"
          description={
            directory.data?.path ??
            "Total size of the daemon's working directory"
          }
          control={
            <div className="flex items-center gap-2">
              <ReadOnlyValue
                query={directory}
                format={(dir) => formatBytes(dir.size)}
              />
              <Button
                variant="subtle"
                size="sm"
                icon={<ArrowClockwiseRegular />}
                onClick={() => void directory.refetch()}
                // 重新读期间旧数值留着，转圈的是按钮本身。
                loading={directory.isFetching}
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
              variant="danger"
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
              variant="danger"
              onClick={() => destroy.mutate()}
              loading={destroying}
            >
              Destroy
            </Button>
          </>
        }
      >
        {directory.data && (
          <p className="text-xs text-(--wb-text-secondary) font-mono break-all">
            {directory.data.path}
          </p>
        )}
      </Dialog>
    </>
  );
}
