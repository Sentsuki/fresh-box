import {
  Text,
  Card,
  Button,
  Spinner,
} from "@fluentui/react-components";
import { ArrowClockwiseRegular, CheckmarkCircleRegular, ErrorCircleRegular, InfoRegular } from "@fluentui/react-icons";

interface Props {
  isRefreshingStatus: boolean;
  processStatus: string;
  processStatusClass: string;
  onRefresh: () => void;
}

export default function ProcessManager({
  isRefreshingStatus,
  processStatus,
  processStatusClass,
  onRefresh,
}: Props) {
  const getStatusIcon = () => {
    if (processStatusClass === "status-success" || processStatusClass === "text-green-500") {
      return <CheckmarkCircleRegular className="text-green-500" />;
    }
    if (processStatusClass === "status-error" || processStatusClass === "text-red-500") {
      return <ErrorCircleRegular className="text-red-500" />;
    }
    return <InfoRegular className="text-blue-500" />;
  };

  return (
    <Card className="flex flex-col gap-4 p-4 bg-neutral-800">
      <Text size={500} weight="semibold">Process Management</Text>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <Button
            appearance="primary"
            icon={isRefreshingStatus ? <Spinner size="extra-tiny" /> : <ArrowClockwiseRegular />}
            disabled={isRefreshingStatus}
            onClick={onRefresh}
          >
            {isRefreshingStatus ? "Refreshing..." : "Refresh Status"}
          </Button>
        </div>

        {processStatus && (
          <div className="rounded-xl border border-neutral-700 bg-neutral-900 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-4 py-3">
              <span className="flex h-6 w-6 items-center justify-center text-base">
                {getStatusIcon()}
              </span>
              <Text weight="semibold" className="text-neutral-300">
                Process Status
              </Text>
            </div>
            <div className="p-4">
              <Text
                className={`block rounded-md border-l-4 p-3 text-sm font-medium leading-relaxed bg-neutral-800 ${processStatusClass}`}
                style={{
                  borderLeftColor: processStatusClass.includes('green') ? 'var(--colorPaletteGreenForeground1)' : processStatusClass.includes('red') ? 'var(--colorPaletteRedForeground1)' : 'var(--colorPaletteBlueForeground1)'
                }}
              >
                {processStatus}
              </Text>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
