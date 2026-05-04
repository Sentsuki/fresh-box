export function getCleanFileName(filePath: string): string {
  const fileNameWithExt = filePath.split(/[/\\]/).pop() || filePath;
  return fileNameWithExt.replace(".json", "");
}

export function formatLastUpdated(lastUpdated?: string): string {
  if (!lastUpdated) return "从未更新";

  const date = new Date(lastUpdated);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  } as Intl.DateTimeFormatOptions);
}
