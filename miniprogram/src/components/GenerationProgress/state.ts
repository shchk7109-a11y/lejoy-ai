export function formatGenerationProgress(
  label: string,
  elapsedSeconds: number,
  estimate: string,
  options: { slowAfterSeconds?: number; slowLabel?: string } = {},
): string {
  const normalizedLabel = label.trim().replace(/[.…。]+$/u, "") || "正在处理";
  const normalizedSeconds = Math.max(0, Math.floor(elapsedSeconds));
  if (
    options.slowLabel
    && options.slowAfterSeconds !== undefined
    && normalizedSeconds >= options.slowAfterSeconds
  ) {
    const normalizedSlowLabel = options.slowLabel.trim().replace(/[.…。]+$/u, "") || normalizedLabel;
    return `${normalizedSlowLabel}…已用 ${normalizedSeconds} 秒`;
  }
  return `${normalizedLabel}…已用 ${normalizedSeconds} 秒，${estimate}`;
}
