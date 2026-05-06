import {
  formatBytes,
  formatSpeed,
} from "../../services/utils";
import {
  getConnectionChain,
  getConnectionHost,
  getConnectionRule,
  useConnectionsStream,
} from "../../hooks/useConnectionsStream";
import type { ConnectionColumnKey, ConnectionEntry } from "../../types/app";

interface Props {
  connection: ConnectionEntry;
  columnKey: ConnectionColumnKey;
}

function formatConnectionStart(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function ConnectionTableCell({ connection, columnKey }: Props) {
  const { formatRelativeDuration } = useConnectionsStream();

  if (columnKey === "host") {
    return (
      <div className="min-w-0 flex flex-col">
        <span className="truncate font-semibold text-neutral-300" title={getConnectionHost(connection)}>
          {getConnectionHost(connection)}
        </span>
        <span
          className="mt-0.5 truncate text-xs text-neutral-500"
          title={`${connection.metadata.destinationIP}:${connection.metadata.destinationPort}`}
        >
          {connection.metadata.destinationIP}:{connection.metadata.destinationPort}
        </span>
      </div>
    );
  }

  if (columnKey === "destination") {
    return (
      <div className="min-w-0 flex flex-col">
        <span
          className="truncate font-medium text-neutral-300"
          title={`${connection.metadata.destinationIP}:${connection.metadata.destinationPort}`}
        >
          {connection.metadata.destinationIP}:{connection.metadata.destinationPort}
        </span>
        <span
          className="mt-0.5 truncate text-xs text-neutral-500"
          title={connection.metadata.host || connection.metadata.sniffHost || "--"}
        >
          {connection.metadata.host || connection.metadata.sniffHost || "--"}
        </span>
      </div>
    );
  }

  if (columnKey === "downloadSpeed") {
    return (
      <div className="text-right flex flex-col">
        <span className="font-medium text-green-500">{formatSpeed(connection.downloadSpeed)}</span>
        <span className="mt-0.5 text-xs text-neutral-500">{formatBytes(connection.download)}</span>
      </div>
    );
  }

  if (columnKey === "uploadSpeed") {
    return (
      <div className="text-right flex flex-col">
        <span className="font-medium text-blue-500">{formatSpeed(connection.uploadSpeed)}</span>
        <span className="mt-0.5 text-xs text-neutral-500">{formatBytes(connection.upload)}</span>
      </div>
    );
  }

  if (columnKey === "download") {
    return (
      <div className="text-right flex flex-col">
        <span className="font-medium text-neutral-300">{formatBytes(connection.download)}</span>
        <span className="mt-0.5 text-xs text-neutral-500">{formatSpeed(connection.downloadSpeed)}</span>
      </div>
    );
  }

  if (columnKey === "upload") {
    return (
      <div className="text-right flex flex-col">
        <span className="font-medium text-neutral-300">{formatBytes(connection.upload)}</span>
        <span className="mt-0.5 text-xs text-neutral-500">{formatSpeed(connection.uploadSpeed)}</span>
      </div>
    );
  }

  if (columnKey === "chain") {
    return (
      <div className="min-w-0 flex flex-col">
        <span className="truncate text-neutral-300" title={getConnectionChain(connection)}>
          {getConnectionChain(connection)}
        </span>
        <span className="mt-0.5 truncate text-xs text-neutral-500">
          {connection.chains.length} hop{connection.chains.length === 1 ? "" : "s"}
        </span>
      </div>
    );
  }

  if (columnKey === "rule") {
    return (
      <div className="min-w-0 flex flex-col">
        <span className="truncate text-neutral-300" title={getConnectionRule(connection)}>
          {getConnectionRule(connection)}
        </span>
        <span
          className="mt-0.5 truncate text-xs text-neutral-500"
          title={connection.rulePayload || connection.metadata.inboundName || "--"}
        >
          {connection.rulePayload || connection.metadata.inboundName || "--"}
        </span>
      </div>
    );
  }

  if (columnKey === "source") {
    return (
      <div className="min-w-0 flex flex-col">
        <span
          className="truncate text-neutral-300"
          title={`${connection.metadata.sourceIP}:${connection.metadata.sourcePort}`}
        >
          {connection.metadata.sourceIP}:{connection.metadata.sourcePort}
        </span>
        <span className="mt-0.5 truncate text-xs text-neutral-500">
          {connection.metadata.inboundName || connection.metadata.inboundUser || "--"}
        </span>
      </div>
    );
  }

  if (columnKey === "process") {
    return (
      <div className="min-w-0 flex flex-col">
        <span
          className="truncate text-neutral-300"
          title={connection.metadata.process || connection.metadata.inboundName || "--"}
        >
          {connection.metadata.process || connection.metadata.inboundName || "--"}
        </span>
        <span
          className="mt-0.5 truncate text-xs text-neutral-500"
          title={connection.metadata.processPath || connection.metadata.inboundUser || "--"}
        >
          {connection.metadata.processPath || connection.metadata.inboundUser || "--"}
        </span>
      </div>
    );
  }

  if (columnKey === "network") {
    return (
      <div className="min-w-0 flex flex-col">
        <span className="truncate text-neutral-300">
          {connection.metadata.network}/{connection.metadata.type}
        </span>
        <span className="mt-0.5 truncate text-xs text-neutral-500">
          {connection.metadata.sniffHost || connection.metadata.host || "--"}
        </span>
      </div>
    );
  }

  if (columnKey === "start") {
    return (
      <div className="text-right flex flex-col">
        <span className="font-medium text-neutral-300">
          {formatRelativeDuration(connection.start)}
        </span>
        <span className="mt-0.5 text-xs text-neutral-500">
          {formatConnectionStart(connection.start)}
        </span>
      </div>
    );
  }

  return null;
}
