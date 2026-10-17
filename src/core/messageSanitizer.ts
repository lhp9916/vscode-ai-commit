/**
 * 清理模型输出：剥离 Markdown 代码围栏、提示性标签与多余空行。
 */
export function sanitizeMessage(raw: string | null | undefined, maxLines = 0): string {
  if (raw == null) {
    return "";
  }
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  text = stripCodeFence(text);

  let lines = text.split("\n").map((line) => {
    if (isLabelLine(line.trim())) {
      return null;
    }
    return line.replace(/[ \t]+$/, "");
  }).filter((line): line is string => line !== null);

  lines = collapseBlankLines(lines);
  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  if (maxLines > 0 && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
  }
  return lines.join("\n").trim();
}

function stripCodeFence(text: string): string {
  if (!text.startsWith("```")) {
    return text;
  }
  const firstBreak = text.indexOf("\n");
  if (firstBreak < 0) {
    return text.replace(/`/g, "").trim();
  }
  let body = text.slice(firstBreak + 1);
  const lastFence = body.lastIndexOf("```");
  if (lastFence >= 0) {
    body = body.slice(0, lastFence);
  }
  return body.trim();
}

function isLabelLine(trimmedLine: string): boolean {
  const lower = trimmedLine.toLowerCase();
  return [
    "提交消息：",
    "提交消息:",
    "提交信息：",
    "提交信息:",
    "commit message:",
    "commit message：",
    "commitmessage:",
    "message:",
  ].includes(lower);
}

function collapseBlankLines(lines: readonly string[]): string[] {
  const result: string[] = [];
  let previousBlank = false;
  for (const line of lines) {
    const blank = line.trim() === "";
    if (blank && previousBlank) {
      continue;
    }
    result.push(line);
    previousBlank = blank;
  }
  return result;
}
