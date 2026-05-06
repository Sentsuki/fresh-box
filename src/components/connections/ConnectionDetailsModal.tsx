import { useMemo } from "react";
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Text,
} from "@fluentui/react-components";
import { formatBytes, formatSpeed } from "../../services/utils";
import { useConnectionsStream } from "../../hooks/useConnectionsStream";
import type { ConnectionEntry } from "../../types/app";

interface Props {
  open: boolean;
  connection: ConnectionEntry | null;
  onClose: () => void;
  onDisconnect: (id: string) => void;
}

export default function ConnectionDetailsModal({
  open,
  connection,
  onClose,
  onDisconnect,
}: Props) {
  const { formatRelativeDuration } = useConnectionsStream();
  const formattedJson = useMemo(
    () => (connection ? JSON.stringify(connection, null, 2) : ""),
    [connection],
  );

  if (!connection) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface className="max-w-5xl w-full">
        <DialogBody>
          <DialogTitle>
            <div className="flex flex-col">
              <Text size={500} weight="semibold">Connection Details</Text>
              <Text size={200} className="text-neutral-500 font-normal">
                {connection.metadata.host || connection.metadata.destinationIP}
              </Text>
            </div>
          </DialogTitle>
          <DialogContent className="grid gap-6 lg:grid-cols-[320px,minmax(0,1fr)] overflow-y-auto p-2">
            <div className="space-y-4">
              <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-4">
                <Text weight="semibold" className="mb-3 block text-neutral-300">Summary</Text>
                <dl className="space-y-2 text-sm text-neutral-400">
                  <div className="flex justify-between gap-4">
                    <dt>Host</dt>
                    <dd className="text-right font-medium text-neutral-200">
                      {connection.metadata.host || "--"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Destination</dt>
                    <dd className="text-right font-medium text-neutral-200">
                      {connection.metadata.destinationIP}:{connection.metadata.destinationPort}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Source</dt>
                    <dd className="text-right font-medium text-neutral-200">
                      {connection.metadata.sourceIP}:{connection.metadata.sourcePort}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Inbound</dt>
                    <dd className="text-right font-medium text-neutral-200">
                      {connection.metadata.inboundName || "--"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Network</dt>
                    <dd className="text-right font-medium text-neutral-200">
                      {connection.metadata.network}/{connection.metadata.type}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Duration</dt>
                    <dd className="text-right font-medium text-neutral-200">
                      {formatRelativeDuration(connection.start)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Download</dt>
                    <dd className="text-right font-medium text-neutral-200">
                      {formatBytes(connection.download)} / {formatSpeed(connection.downloadSpeed)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Upload</dt>
                    <dd className="text-right font-medium text-neutral-200">
                      {formatBytes(connection.upload)} / {formatSpeed(connection.uploadSpeed)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 p-4">
                <Text weight="semibold" className="mb-3 block text-neutral-300">Route</Text>
                <Text className="block text-neutral-300">
                  {connection.chains.length > 0 ? connection.chains.join(" -> ") : "--"}
                </Text>
                <Text size={200} className="block mt-3 text-neutral-500">Rule</Text>
                <Text className="block text-neutral-300">{connection.rule || "--"}</Text>
                {connection.rulePayload && (
                  <Text size={200} className="block mt-1 text-neutral-400">
                    {connection.rulePayload}
                  </Text>
                )}
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-neutral-700 bg-neutral-900 p-4 overflow-hidden">
              <pre className="overflow-auto max-h-[60vh] text-xs leading-6 text-neutral-300 font-mono">
                {formattedJson}
              </pre>
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              color="danger"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                onDisconnect(connection.id);
                onClose();
              }}
            >
              Disconnect
            </Button>
            <Button appearance="secondary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
