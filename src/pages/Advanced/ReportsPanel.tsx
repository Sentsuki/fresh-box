import {
  ArrowDownloadRegular,
  DeleteRegular,
  DocumentRegular,
} from "@fluentui/react-icons";
import { save } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Section } from "../../components/ui/Section";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../hooks/useToast";
import { formatLastUpdated, toSafeFileName } from "../../services/utils";
import type { ReportFileView, ReportSummary } from "../../types/app";
import { queryKeys } from "../../services/queryClient";
import { getErrorMessage } from "../../services/tauri";

interface ReportsApi {
  list: () => Promise<ReportSummary[]>;
  read: (id: string) => Promise<ReportFileView[]>;
  // `Promise<unknown>`：生成的命令对 Rust 的 `()` 返回 `Promise<null>`，
  // 这里只关心它完成。
  remove: (id: string) => Promise<unknown>;
  removeAll: () => Promise<unknown>;
  /** 打包成 zip 写到 `destination`，返回落盘路径。只有 daemon 记的报告有
   * （见 `ReportSummary.exportable`）。 */
  export: (
    id: string,
    destination: string,
    withConfiguration: boolean,
    withLog: boolean,
  ) => Promise<string>;
}

interface ReportsPanelProps {
  /** 这一类报告的标识，用作查询 key —— 同一页上有好几个面板。 */
  kind: string;
  title: string;
  description: string;
  emptyHint: string;
  api: ReportsApi;
  /** Rendered above the report list — e.g. the OOM killer/power report
   * enable switches, which live here rather than in Settings since this is
   * the one place their effect (whether a report ever shows up) is visible. */
  settingsPanel?: React.ReactNode;
}

export function ReportsPanel({
  kind,
  title,
  description,
  emptyHint,
  api,
  settingsPanel,
}: ReportsPanelProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ReportSummary | null>(null);
  // 开关单独存：关闭时 `selected` 留着，弹窗的退场动画期间标题和按钮不会先消失。
  const [dialogOpen, setDialogOpen] = useState(false);

  const listKey = queryKeys.reports(kind);
  const reports = useQuery({ queryKey: listKey, queryFn: api.list });

  const files = useQuery({
    queryKey: queryKeys.reportFiles(kind, selected?.id ?? ""),
    queryFn: async () => {
      const report = selected as ReportSummary;
      const result = await api.read(report.id);
      // 读过一次 daemon 就把它标成已读 —— 列表里那个小圆点要跟着消失。
      if (!report.isRead) {
        void queryClient.invalidateQueries({ queryKey: listKey });
      }
      return result;
    },
    enabled: selected !== null,
  });

  const open = (report: ReportSummary) => {
    setSelected(report);
    setDialogOpen(true);
  };

  const remove = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => {
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (err) =>
      toast.error(`Failed to delete report: ${getErrorMessage(err)}`),
  });

  const removeAll = useMutation({
    mutationFn: () => api.removeAll(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: listKey }),
    onError: (err) =>
      toast.error(`Failed to delete reports: ${getErrorMessage(err)}`),
  });

  /**
   * 打包一份报告交给用户。
   *
   * 保存位置由系统对话框决定（UI 的事），RPC 和落盘在 Rust（webview 碰不到
   * 文件系统）。配置和日志都带上 —— 这个按钮的用途就是「提 issue 时附上」，
   * 少带一样往往就要再来一轮。
   */
  const exportReport = async (report: ReportSummary) => {
    const suggested = `${toSafeFileName(report.id)}.zip`;
    const destination = await save({
      defaultPath: suggested,
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
    });
    // 用户取消了对话框。
    if (!destination) return;
    try {
      const written = await api.export(report.id, destination, true, true);
      toast.success("Report exported.", written);
    } catch (err) {
      toast.error(`Failed to export report: ${getErrorMessage(err)}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {settingsPanel}
      <Section
        title={title}
        description={description}
        actions={
          reports.data && reports.data.length > 0 ? (
            <Button
              variant="subtle"
              size="sm"
              icon={<DeleteRegular />}
              loading={removeAll.isPending}
              onClick={() => removeAll.mutate()}
            >
              Delete all
            </Button>
          ) : undefined
        }
      >
        {reports.isPending ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : reports.isError ? (
          <p className="text-sm text-(--wb-error) py-6 text-center">
            Failed to load reports: {getErrorMessage(reports.error)}
          </p>
        ) : reports.data.length === 0 ? (
          <p className="text-sm text-(--wb-text-tertiary) py-6 text-center">
            {emptyHint}
          </p>
        ) : (
          <div className="rounded-(--wb-radius-lg) border border-(--wb-border-subtle) overflow-hidden divide-y divide-(--wb-border-subtle)">
            {reports.data.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => open(report)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left bg-(--wb-surface-layer) hover:bg-(--wb-surface-hover) transition-colors"
              >
                <span
                  className={[
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    report.isRead ? "bg-transparent" : "bg-(--wb-accent)",
                  ].join(" ")}
                />
                <span className="text-sm text-(--wb-text-primary)">
                  {formatLastUpdated(report.time)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Dialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={selected ? formatLastUpdated(selected.time) : ""}
        icon={<DocumentRegular />}
        footer={
          selected && (
            <>
              <Button
                variant="subtle"
                icon={<DeleteRegular />}
                loading={remove.isPending}
                onClick={() => remove.mutate(selected.id)}
              >
                Delete
              </Button>
              {selected.exportable && (
                <Button
                  variant="subtle"
                  icon={<ArrowDownloadRegular />}
                  onClick={() => void exportReport(selected)}
                >
                  Export
                </Button>
              )}
              <Button variant="accent" onClick={() => setDialogOpen(false)}>
                Close
              </Button>
            </>
          )
        }
      >
        {files.isPending ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : files.isError ? (
          <p className="text-sm text-(--wb-error)">
            Failed to read report: {getErrorMessage(files.error)}
          </p>
        ) : files.data.length === 0 ? (
          <p className="text-sm text-(--wb-text-tertiary)">Empty</p>
        ) : (
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {files.data.map((file) => (
              <div key={file.name} className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-(--wb-text-tertiary) uppercase tracking-wide">
                  {file.name}
                </span>
                {file.isBinary || file.content === null ? (
                  <p className="text-xs italic text-(--wb-text-disabled)">
                    Binary file, not shown here.
                  </p>
                ) : (
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all p-3 rounded-(--wb-radius-md) bg-(--wb-surface-base) border border-(--wb-border-subtle)">
                    {file.content || "(empty)"}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}
