import { formatBytes, formatRelativeDuration, formatSpeed } from "../../services/utils";
import type { ConnectionEntry } from "../../types/app";

interface Props {
  connection: ConnectionEntry | null;
  open: boolean;
  onClose: () => void;
  onDisconnect: (id: string) => void;
}

export function ConnectionDetailsModal({ connection, open, onClose, onDisconnect }: Props) {
  if (!open || !connection) return null;

  const { metadata } = connection;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[var(--wb-surface-base)] border border-[var(--wb-border-default)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--wb-border-default)] px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--wb-text-primary)]">Connection Details</h3>
            <p className="mt-1 text-sm text-[var(--wb-text-secondary)]">
              {metadata.host || metadata.destinationIP}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg bg-[var(--wb-error)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--wb-error-hover)]"
              onClick={() => { onDisconnect(connection.id); onClose(); }}
            >
              Disconnect
            </button>
            <button
              className="rounded-lg bg-[var(--wb-surface-layer)] px-4 py-2 text-sm font-medium text-[var(--wb-text-primary)] border border-[var(--wb-border-default)] transition-colors hover:bg-[var(--wb-surface-hover)]"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid gap-6 overflow-y-auto p-6 lg:grid-cols-[320px,minmax(0,1fr)]">
          {/* Left column: summary + route */}
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] p-4">
              <h4 className="mb-3 text-sm font-semibold text-[var(--wb-text-primary)]">Summary</h4>
              <dl className="space-y-2 text-sm">
                <DetailRow label="Host" value={metadata.host || "--"} />
                <DetailRow
                  label="Destination"
                  value={`${metadata.destinationIP}:${metadata.destinationPort}`}
                />
                <DetailRow
                  label="Source"
                  value={`${metadata.sourceIP}:${metadata.sourcePort}`}
                />
                <DetailRow
                  label="Network"
                  value={`${metadata.network}/${metadata.type}`}
                />
                <DetailRow
                  label="Duration"
                  value={formatRelativeDuration(connection.start)}
                />
                <DetailRow
                  label="Download"
                  value={`${formatBytes(connection.download)} / ${formatSpeed(connection.downloadSpeed)}`}
                />
                <DetailRow
                  label="Upload"
                  value={`${formatBytes(connection.upload)} / ${formatSpeed(connection.uploadSpeed)}`}
                />
              </dl>
            </div>

            <div className="rounded-xl border border-[var(--wb-border-default)] bg-[var(--wb-surface-layer)] p-4">
              <h4 className="mb-3 text-sm font-semibold text-[var(--wb-text-primary)]">Route</h4>
              <p className="text-sm text-[var(--wb-text-primary)]">
                {connection.chains.length > 0 ? connection.chains.join(" → ") : "--"}
              </p>
              <p className="mt-3 text-xs text-[var(--wb-text-secondary)]">Rule</p>
              <p className="text-sm text-[var(--wb-text-primary)]">{connection.rule || "--"}</p>
              {connection.rulePayload && (
                <p className="mt-2 text-xs text-[var(--wb-text-tertiary)]">{connection.rulePayload}</p>
              )}
            </div>
          </div>

          {/* Right column: raw JSON */}
          <div className="min-w-0 rounded-xl border border-[var(--wb-border-default)] bg-[#0d1117] p-4">
            <pre className="overflow-x-auto text-xs leading-6 text-slate-100">
              {JSON.stringify(connection, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--wb-text-secondary)]">{label}</dt>
      <dd className="text-right font-medium text-[var(--wb-text-primary)] break-all">{value}</dd>
    </div>
  );
}
