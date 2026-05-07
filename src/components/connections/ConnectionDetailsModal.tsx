import { DismissRegular, InfoRegular, GlobeRegular, ArrowRightRegular, DeleteRegular, DocumentRegular } from "@fluentui/react-icons";
import { formatBytes, formatRelativeDuration, formatSpeed } from "../../services/utils";
import type { ConnectionEntry } from "../../types/app";
import { Button } from "../ui/Button";

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div 
        className="flex flex-col w-full max-w-4xl max-h-[90vh] rounded-(--wb-radius-lg) bg-(--wb-surface-flyout) backdrop-blur-xl border border-(--wb-border-default) shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-black/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-(--wb-accent)/10 flex items-center justify-center text-(--wb-accent)">
              <GlobeRegular className="text-xl" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-(--wb-text-primary) leading-tight">Connection Details</h3>
              <p className="text-sm text-(--wb-text-secondary) truncate max-w-[300px] sm:max-w-md">
                {metadata.host || metadata.destinationIP}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-md hover:bg-(--wb-surface-hover) text-(--wb-text-tertiary) hover:text-(--wb-text-primary) transition-colors"
          >
            <DismissRegular className="text-xl" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Section: Information */}
            <div className="space-y-6">
              <section>
                <h4 className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-(--wb-text-tertiary)">
                  <InfoRegular className="text-sm" />
                  Summary
                </h4>
                <div className="grid gap-px bg-(--wb-border-subtle) rounded-lg border border-(--wb-border-subtle) overflow-hidden shadow-sm">
                  <PropertyRow label="Host" value={metadata.host || "--"} />
                  <PropertyRow label="Destination" value={`${metadata.destinationIP}:${metadata.destinationPort}`} />
                  <PropertyRow label="Source" value={`${metadata.sourceIP}:${metadata.sourcePort}`} />
                  <PropertyRow label="Network" value={`${metadata.network.toUpperCase()} (${metadata.type})`} />
                  <PropertyRow label="Duration" value={formatRelativeDuration(connection.start)} />
                  <PropertyRow 
                    label="Download" 
                    value={<span className="flex items-center gap-1.5">{formatBytes(connection.download)} <span className="text-[11px] opacity-60 font-normal">({formatSpeed(connection.downloadSpeed)})</span></span>} 
                  />
                  <PropertyRow 
                    label="Upload" 
                    value={<span className="flex items-center gap-1.5">{formatBytes(connection.upload)} <span className="text-[11px] opacity-60 font-normal">({formatSpeed(connection.uploadSpeed)})</span></span>} 
                  />
                </div>
              </section>

              <section>
                <h4 className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-(--wb-text-tertiary)">
                  <ArrowRightRegular className="text-sm" />
                  Route & Rule
                </h4>
                <div className="space-y-3">
                  <div className="p-4 rounded-lg bg-(--wb-surface-layer) border border-(--wb-border-subtle) shadow-sm">
                    <p className="text-[11px] font-bold text-(--wb-text-tertiary) uppercase tracking-tighter mb-1.5">Chain</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {connection.chains.length > 0 ? (
                        connection.chains.map((node, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-(--wb-surface-active) text-xs font-medium border border-(--wb-border-subtle)">{node}</span>
                            {i < connection.chains.length - 1 && <ArrowRightRegular className="text-(--wb-text-tertiary) text-xs" />}
                          </div>
                        ))
                      ) : (
                        <span className="text-sm italic text-(--wb-text-disabled)">No chain information</span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-(--wb-surface-layer) border border-(--wb-border-subtle) shadow-sm">
                    <p className="text-[11px] font-bold text-(--wb-text-tertiary) uppercase tracking-tighter mb-1.5">Rule</p>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-(--wb-accent)">{connection.rule || "--"}</p>
                      {connection.rulePayload && (
                        <p className="text-xs text-(--wb-text-secondary) font-mono break-all">{connection.rulePayload}</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Section: Metadata JSON */}
            <div className="flex flex-col min-h-[400px]">
              <h4 className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-(--wb-text-tertiary)">
                <DocumentRegular className="text-sm" />
                Metadata (JSON)
              </h4>
              <div className="flex-1 rounded-lg border border-(--wb-border-default) bg-[#1e1e1e] p-4 font-mono text-[11px] leading-relaxed overflow-hidden flex flex-col shadow-inner">
                <div className="flex-1 overflow-auto scrollbar-thin">
                  <pre className="text-sky-300/90 whitespace-pre-wrap break-all">
                    {JSON.stringify(connection, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-black/10 flex items-center justify-between border-t border-(--wb-border-default)">
          <div className="text-[11px] text-(--wb-text-tertiary) font-medium">
            Connection ID: <span className="font-mono text-[10px]">{connection.id}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="accent"
              onClick={() => { onDisconnect(connection.id); onClose(); }}
              className="min-w-24 bg-(--wb-error) hover:bg-(--wb-error-hover) active:bg-(--wb-error-hover) border-none text-white flex items-center gap-2"
            >
              <DeleteRegular className="text-lg" />
              Disconnect
            </Button>
            <Button 
              variant="subtle"
              onClick={onClose}
              className="min-w-24"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-(--wb-surface-layer) group hover:bg-(--wb-surface-hover) transition-colors">
      <dt className="text-xs font-medium text-(--wb-text-secondary)">{label}</dt>
      <dd className="text-xs font-semibold text-(--wb-text-primary) text-right truncate ml-4">{value}</dd>
    </div>
  );
}

