import {
  Text,
  Card,
  Badge,
  Select,
  Button,
  ProgressBar,
  Spinner,
} from "@fluentui/react-components";
import { ArrowClockwiseRegular, SettingsRegular } from "@fluentui/react-icons";
import type {
  CoreUpdateProgressEvent,
  SingboxCoreOption,
  SingboxCoreStatus,
} from "../../types/app";

interface Props {
  coreStatus: SingboxCoreStatus | null;
  coreStatusError: string;
  coreUpdateProgress: CoreUpdateProgressEvent | null;
  currentCoreLabel: string;
  selectedCoreLabel: string;
  selectedCoreOptionKey: string;
  coreStatusText: string;
  coreStatusBadgeClass: string;
  isRefreshingCoreStatus: boolean;
  isUpdatingCore: boolean;
  updateCoreButtonLabel: string;
  availableOptions: SingboxCoreOption[];
  onRefresh: () => void;
  onApply: () => void;
  onSelectedCoreOptionKeyChange: (value: string) => void;
}

function getBadgeColor(badgeClass: string): "subtle" | "brand" | "informative" | "warning" | "danger" | "success" {
  if (badgeClass.includes("red")) return "danger";
  if (badgeClass.includes("green")) return "success";
  if (badgeClass.includes("violet")) return "brand";
  return "subtle";
}

export default function SingboxCoreSection({
  coreStatus,
  coreStatusError,
  coreUpdateProgress,
  currentCoreLabel,
  selectedCoreLabel,
  selectedCoreOptionKey,
  coreStatusText,
  coreStatusBadgeClass,
  isRefreshingCoreStatus,
  isUpdatingCore,
  updateCoreButtonLabel,
  availableOptions,
  onRefresh,
  onApply,
  onSelectedCoreOptionKeyChange,
}: Props) {
  return (
    <Card className="flex flex-col gap-4 p-4 bg-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text size={500} weight="semibold">Sing-box Core</Text>
        <Badge appearance="filled" color={getBadgeColor(coreStatusBadgeClass)}>
          {coreStatusText}
        </Badge>
      </div>

      <Text size={200} className="text-neutral-500">
        Stable and Testing each keep the latest 3 available releases.
      </Text>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 mt-2">
        <div className="flex flex-col gap-1 rounded-lg border border-neutral-700 bg-neutral-900 p-3">
          <Text size={200} className="uppercase tracking-wide text-neutral-500 font-semibold">
            Current Core
          </Text>
          <Text size={300} weight="semibold">
            {currentCoreLabel}
          </Text>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-neutral-700 bg-neutral-900 p-3">
          <Text size={200} className="uppercase tracking-wide text-neutral-500 font-semibold">
            Selected Target
          </Text>
          <Text size={300} weight="semibold">
            {selectedCoreLabel}
          </Text>
        </div>
      </div>

      {coreStatus?.is_running && (
        <Card className="border-yellow-600 bg-yellow-900/20 text-yellow-500 p-3">
          <Text size={200}>
            You can switch to another installed core while sing-box is running.
            Restart sing-box after the change to start using the selected version.
          </Text>
        </Card>
      )}

      {coreStatusError && (
        <Card className="border-red-900/50 bg-red-900/10 p-3">
          <Text size={200} className="text-red-400">
            {coreStatusError}
          </Text>
        </Card>
      )}

      {coreUpdateProgress && (
        <Card className="border-brand-800 bg-brand-900/20 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-brand-300">
            <Text weight="medium">{coreUpdateProgress.message}</Text>
            <Text size={200} weight="semibold">{coreUpdateProgress.percent}%</Text>
          </div>
          <ProgressBar value={coreUpdateProgress.percent / 100} color="brand" />
        </Card>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-700 bg-neutral-900 p-3 mt-2">
        <Text size={200} className="uppercase tracking-wide text-neutral-500 font-semibold">
          Core Channel / Version
        </Text>
        <Select
          value={selectedCoreOptionKey}
          disabled={isRefreshingCoreStatus || isUpdatingCore || !availableOptions.length}
          onChange={(_, data) => onSelectedCoreOptionKeyChange(data.value)}
        >
          {availableOptions.map((option) => (
            <option
              key={`${option.channel}:${option.version}`}
              value={`${option.channel}:${option.version}`}
            >
              {option.label}{option.installed ? " (Installed)" : ""}{option.is_active ? " (Active)" : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap gap-3 mt-2">
        <Button
          appearance="secondary"
          icon={isRefreshingCoreStatus ? <Spinner size="extra-tiny" /> : <ArrowClockwiseRegular />}
          disabled={isRefreshingCoreStatus || isUpdatingCore}
          onClick={onRefresh}
        >
          {isRefreshingCoreStatus ? "Checking..." : "Refresh Releases"}
        </Button>

        <Button
          appearance="primary"
          icon={isUpdatingCore ? <Spinner size="extra-tiny" /> : <SettingsRegular />}
          disabled={isUpdatingCore || isRefreshingCoreStatus || !selectedCoreOptionKey}
          onClick={onApply}
        >
          {updateCoreButtonLabel}
        </Button>
      </div>
    </Card>
  );
}
