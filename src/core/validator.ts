const ALLOWED_TYPES = new Set([
  "feat",
  "fix",
  "build",
  "chore",
  "ci",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "revert",
]);

export const HEADER_MAX_LENGTH = 100;
const HEADER = /^([A-Za-z]+)(?:\(([^)]*)\))?(!)?: (.+)$/;

/**
 * 按 Conventional Commits 1.0.0 与 commitlint conventional 默认规则校验。
 */
export function validateCommitMessage(message: string | null | undefined): string[] {
  const problems: string[] = [];
  if (message == null || message.trim() === "") {
    return ["提交消息为空"];
  }

  const normalized = message.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const lines = normalized.split("\n");
  const header = lines[0].trim();

  if (header.length > HEADER_MAX_LENGTH) {
    problems.push(`首行超过 ${HEADER_MAX_LENGTH} 字符（当前 ${header.length}）`);
  }

  const match = HEADER.exec(header);
  if (!match) {
    problems.push(`首行必须符合 \`<type>(<scope>): <描述>\` 格式，当前为：${header}`);
    return problems;
  }

  const type = match[1].toLowerCase();
  const scope = match[2];
  const description = match[4].trim();

  if (!ALLOWED_TYPES.has(type)) {
    problems.push(`类型 \`${type}\` 不在允许范围内：${Array.from(ALLOWED_TYPES).join("/")}`);
  }
  problems.push(...validateScope(scope));
  problems.push(...validateDescription(description));

  if (lines.length > 1 && lines[1].trim() !== "") {
    problems.push("正文与首行之间必须空一行");
  }
  problems.push(...validateBreakingChange(lines));
  return problems;
}

function validateScope(scope: string | undefined): string[] {
  if (scope == null) {
    return [];
  }
  const problems: string[] = [];
  const trimmed = scope.trim();
  if (trimmed === "") {
    problems.push("scope 不能是空括号，不需要时请整体省略");
    return problems;
  }
  if (trimmed !== scope) {
    problems.push("scope 两侧不能有空格");
  }
  if (/[A-Z]/.test(trimmed)) {
    problems.push(`scope \`${trimmed}\` 应使用小写（如 upload 而非 uploadFile）`);
  }
  if (/\s/.test(trimmed)) {
    problems.push(`scope \`${trimmed}\` 不能包含空格`);
  }
  return problems;
}

function validateDescription(description: string): string[] {
  if (description === "") {
    return ["描述不能为空"];
  }
  if (/[.。]$/.test(description)) {
    return ["描述结尾不要加句号"];
  }
  return [];
}

function validateBreakingChange(lines: readonly string[]): string[] {
  let hasFooter = false;
  let hasLowercaseFooter = false;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("BREAKING CHANGE: ") || line.startsWith("BREAKING-CHANGE: ")) {
      hasFooter = true;
    } else if (/^breaking[ -]change:/i.test(line)) {
      hasLowercaseFooter = true;
    }
  }
  return hasLowercaseFooter && !hasFooter
    ? ["`BREAKING CHANGE` 作为脚注令牌时必须全大写"]
    : [];
}
