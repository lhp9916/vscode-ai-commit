import { FileSection } from "./types";

/**
 * 把变更片段渲染成提示词文本；超出预算时按文件截断，但始终保留完整文件清单。
 */
export function renderPatch(sections: readonly FileSection[], perFileChars: number, totalChars: number): string {
  const parts = [`变更文件（${sections.length} 个）：`];
  for (const section of sections) {
    parts.push(`- ${section.path} (${section.status})`);
  }

  const effectivePerFile = perFileChars > 0 ? perFileChars : Number.MAX_SAFE_INTEGER;
  const effectiveTotal = totalChars > 0 ? totalChars : Number.MAX_SAFE_INTEGER;
  let used = 0;
  let omitted = 0;
  parts.push("", "差异内容：");

  for (const section of sections) {
    if (section.binary) {
      continue;
    }
    if (used >= effectiveTotal) {
      omitted += 1;
      continue;
    }
    const text = section.diffText;
    const budget = Math.min(effectivePerFile, effectiveTotal - used);
    const truncated = text.length > budget;
    const chunk = truncated ? text.slice(0, budget) : text;
    parts.push(chunk.endsWith("\n") ? chunk.slice(0, -1) : chunk);
    if (truncated) {
      parts.push("…（该文件差异已截断）");
    }
    used += chunk.length;
  }
  if (omitted > 0) {
    parts.push("", `…（另有 ${omitted} 个文件的差异因超出长度上限被省略）`);
  }
  return parts.join("\n");
}
