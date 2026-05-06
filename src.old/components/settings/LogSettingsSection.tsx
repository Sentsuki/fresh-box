import {
  Text,
  Card,
  Switch,
  Spinner,
} from "@fluentui/react-components";
import type { LogLevel, StackOption } from "../../types/app";

interface Props {
  isLoading: boolean;
  enableTransitions: boolean;
  selectedStackOption: StackOption;
  stackOptions: StackOption[];
  hasStackField: boolean;
  logDisabled: boolean;
  selectedLogLevel: LogLevel;
  logLevels: LogLevel[];
  hasLogField: boolean;
  onSetStackOption: (option: StackOption) => void;
  onLogDisabledChange: (disabled: boolean) => void;
  onSetLogLevel: (level: LogLevel) => void;
}

export default function LogSettingsSection({
  isLoading,
  selectedStackOption,
  stackOptions,
  hasStackField,
  logDisabled,
  selectedLogLevel,
  logLevels,
  hasLogField,
  onSetStackOption,
  onLogDisabledChange,
  onSetLogLevel,
}: Props) {
  return (
    <Card className="flex flex-col gap-6 p-4 bg-neutral-800">
      <div>
        <Text size={500} weight="semibold">Configuration</Text>
      </div>

      <div className="flex flex-col gap-4">
        {(hasStackField || isLoading) && (
          <div className="flex flex-col gap-2">
            <Text weight="medium">Stack</Text>
            {isLoading ? (
              <Spinner size="tiny" className="self-start" />
            ) : (
              <div className="flex bg-neutral-900 rounded-lg p-1 w-max">
                {stackOptions.map((option) => (
                  <button
                    key={option}
                    className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                      selectedStackOption === option
                        ? "bg-neutral-700 text-neutral-100 font-medium shadow-sm"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                    onClick={() => onSetStackOption(option)}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {(hasLogField || isLoading) && (
          <div className="flex flex-col gap-4">
            <Text weight="medium">Log</Text>
            
            {isLoading ? (
              <Spinner size="tiny" className="self-start" />
            ) : (
              <div className="flex flex-col gap-4 ml-2">
                <div className="flex items-center justify-between max-w-sm">
                  <Text>Disable Logging</Text>
                  <Switch
                    checked={logDisabled}
                    onChange={(_, data) => onLogDisabledChange(data.checked)}
                  />
                </div>

                {!logDisabled && (
                  <div className="flex flex-col gap-2 max-w-sm">
                    <Text size={200} className="text-neutral-400">Level</Text>
                    <div className="flex flex-wrap bg-neutral-900 rounded-lg p-1 w-max">
                      {logLevels.map((level) => (
                        <button
                          key={level}
                          className={`px-3 py-1 text-sm rounded-md transition-colors ${
                            selectedLogLevel === level
                              ? "bg-neutral-700 text-neutral-100 font-medium shadow-sm"
                              : "text-neutral-400 hover:text-neutral-200"
                          }`}
                          onClick={() => onSetLogLevel(level)}
                        >
                          {level.charAt(0).toUpperCase() + level.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!hasStackField && !hasLogField && !isLoading && (
          <div className="py-4 text-center">
            <Text italic className="text-neutral-500">
              No configuration options available for the current config file.
            </Text>
          </div>
        )}
      </div>
    </Card>
  );
}
