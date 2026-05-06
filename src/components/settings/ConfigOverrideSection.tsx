import {
  Text,
  Switch,
  Textarea,
  Button,
  Card,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from "@fluentui/react-components";
import { SaveRegular, DismissRegular } from "@fluentui/react-icons";

interface Props {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  config: string;
  onConfigChange: (config: string) => void;
  isValidJson: boolean;
  jsonError: string;
  onSave: () => void;
  onClear: () => void;
}

export default function ConfigOverrideSection({
  enabled,
  onEnabledChange,
  config,
  onConfigChange,
  isValidJson,
  jsonError,
  onSave,
  onClear,
}: Props) {
  return (
    <Card className="flex flex-col gap-4 p-4 bg-neutral-800">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <Text size={500} weight="semibold">Config Override</Text>
          <Text size={200} className="text-neutral-500">
            Override the configuration JSON before starting sing-box
          </Text>
        </div>
        <Switch
          checked={enabled}
          onChange={(_, data) => onEnabledChange(data.checked)}
          label={enabled ? "Enabled" : "Disabled"}
        />
      </div>

      {enabled && (
        <div className="flex flex-col gap-3 mt-2">
          <Textarea
            value={config}
            onChange={(_, data) => onConfigChange(data.value)}
            placeholder="Enter your configuration override here (JSON format)"
            className="w-full font-mono text-[13px] min-h-[280px]"
            resize="vertical"
            appearance={!isValidJson ? "outline" : "filled-darker"}
            style={{
              borderColor: !isValidJson ? "var(--colorPaletteRedBorderActive)" : undefined,
            }}
          />

          {!isValidJson && (
            <MessageBar intent="error">
              <MessageBarBody>
                <MessageBarTitle>JSON Error:</MessageBarTitle>
                {jsonError}
              </MessageBarBody>
            </MessageBar>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <Button
              appearance="secondary"
              icon={<DismissRegular />}
              onClick={onClear}
            >
              Clear Override
            </Button>
            <Button
              appearance="primary"
              icon={<SaveRegular />}
              disabled={!isValidJson}
              onClick={onSave}
            >
              Save Override
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
