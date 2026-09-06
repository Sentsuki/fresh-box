import { DeleteRegular, DocumentRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Section } from "../../components/ui/Section";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../hooks/useToast";
import { formatLastUpdated } from "../../services/utils";
import type { ReportFileView, ReportSummary } from "../../types/app";

export interface ReportsApi {
  list: () => Promise<ReportSummary[]>;
  read: (id: string) => Promise<ReportFileView[]>;
  remove: (id: string) => Promise<void>;
  removeAll: () => Promise<void>;
}

interface ReportsPanelProps {
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
  title,
  description,
  emptyHint,
  api,
  settingsPanel,
}: ReportsPanelProps) {
  const toast = useToast();
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [selected, setSelected] = useState<ReportSummary | null>(null);
  const [files, setFiles] = useState<ReportFileView[] | null>(null);

  const reload = useCallback(() => {
    api
      .list()
      .then(setReports)
      .catch((err) => {
        setReports([]);
        toast.error(
          `Failed to load reports: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    // `api` is a fresh object literal from the caller every render; the
    // panel's own report kind never changes at runtime, so re-running this
    // on every render would be wasteful without buying anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const open = async (report: ReportSummary) => {
    setSelected(report);
    setFiles(null);
    try {
      setFiles(await api.read(report.id));
    } catch (err) {
      toast.error(
        `Failed to read report: ${err instanceof Error ? err.message : String(err)}`,
      );
      setFiles([]);
    }
    if (!report.isRead) reload();
  };

  const remove = async (id: string) => {
    try {
      await api.remove(id);
      setSelected(null);
      reload();
    } catch (err) {
      toast.error(
        `Failed to delete report: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const removeAll = async () => {
    try {
      await api.removeAll();
      reload();
    } catch (err) {
      toast.error(
        `Failed to delete reports: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {settingsPanel}
      <Section
        title={title}
        description={description}
        actions={
          reports && reports.length > 0 ? (
            <Button
              variant="subtle"
              size="sm"
              icon={<DeleteRegular />}
              onClick={() => void removeAll()}
            >
              Delete all
            </Button>
          ) : undefined
        }
      >
        {reports === null ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : reports.length === 0 ? (
          <p className="text-sm text-(--wb-text-tertiary) py-6 text-center">
            {emptyHint}
          </p>
        ) : (
          <div className="rounded-(--wb-radius-lg) border border-(--wb-border-subtle) overflow-hidden divide-y divide-(--wb-border-subtle)">
            {reports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => void open(report)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left bg-(--wb-surface-layer) hover:bg-(--wb-surface-hover) transition-colors"
              >
                <span
                  className={[
                    "w-1.5 h-1.5 rounded-full flex-shrink-0",
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
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? formatLastUpdated(selected.time) : ""}
        icon={<DocumentRegular />}
        footer={
          selected && (
            <>
              <Button
                variant="subtle"
                icon={<DeleteRegular />}
                onClick={() => void remove(selected.id)}
              >
                Delete
              </Button>
              <Button variant="accent" onClick={() => setSelected(null)}>
                Close
              </Button>
            </>
          )
        }
      >
        {files === null ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : files.length === 0 ? (
          <p className="text-sm text-(--wb-text-tertiary)">Empty</p>
        ) : (
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {files.map((file) => (
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
