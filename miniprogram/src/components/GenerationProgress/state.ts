export function formatGenerationProgress(label: string, elapsedSeconds: number, estimate: string): string {
  const normalizedLabel = label.trim().replace(/[.…。]+$/u, "") || "正在处理";
  const normalizedSeconds = Math.max(0, Math.floor(elapsedSeconds));
  return `${normalizedLabel}…已用 ${normalizedSeconds} 秒，${estimate}`;
}
