import { MessageStyle } from "./types";

export function buildSystemPrompt(style: MessageStyle, extraPrompt: string, strictMode = false): string {
  const lines = [
    "你是一个专业的 Git 提交消息生成助手。请根据用户提供的代码变更，生成一条高质量的提交消息。",
    styleRules(style, strictMode),
    "- 只输出提交消息本身，不要输出额外解释、前后缀、引号或 Markdown 代码块",
  ];
  const extra = extraPrompt.trim();
  if (extra) {
    lines.push("", "用户附加要求：", extra);
  }
  return lines.join("\n");
}

function styleRules(style: MessageStyle, strictMode: boolean): string {
  switch (style) {
    case "plainZh":
      return [
        "要求：",
        "- 使用中文，单行描述这次变更做了什么",
        "- 不加类型前缀，不超过 50 字，结尾不加句号",
      ].join("\n");
    case "conventionalEn":
      return conventionalRules(
        "英文",
        "description",
        strictMode,
        "- description 使用祈使语气、小写开头，说明这次变更做了什么，不超过 72 字符，结尾不加句号",
        "每条不超过 72 字符，结尾不加句号",
      );
    case "conventionalZh":
    default:
      return conventionalRules(
        "中文",
        "描述",
        strictMode,
        "- 描述使用中文，说明这次变更做了什么，不超过 50 字，结尾不加句号",
        "每条不超过 60 字，结尾不加句号",
      );
  }
}

function conventionalRules(
  language: string,
  descriptionLabel: string,
  strictMode: boolean,
  descriptionRule: string,
  bodyLineRule: string,
): string {
  const lines = [
    `要求：`,
    `- 使用${language}，严格遵循 Conventional Commits 1.0.0：\`<type>(<scope>): <${descriptionLabel}>\`，scope 与 \`!\` 均为可选，不需要时省略`,
    "- type 只能取以下之一：feat（新增功能或能力）、fix（修复缺陷）、refactor（重构且不改变外部行为）、perf（性能优化）、docs、style、test、build、ci、chore、revert（回退某次提交）",
    "- 判断要点：新增日志、埋点、开关等能力属于 feat；仅修正错误行为才用 fix；调整措辞或格式且无功能变化用 style 或 chore",
    "- scope 使用简短的模块名（如 upload、auth、order），必须小写，不要使用文件名或驼峰长名（不要写成 uploadFile 这类）；无法判断时整体省略，不要写成空括号 ()",
    descriptionRule,
    "- 破坏性变更（删除或重命名公开 API、修改函数签名或默认值、修改配置项或数据格式导致不兼容）必须在类型后加 `!`，并在正文首行以 `BREAKING CHANGE: ` 开头说明影响与迁移方式；若无法确认是否破坏兼容，则不要加 `!`",
    "- 如变更关联 issue，可在末尾加脚注，如 `Refs: #123` 或 `Closes: #123`",
    `- 在${descriptionLabel}后空一行补充正文要点，每条以 "- " 开头：`,
    "  - 说明改动的目的、关键做法或影响，2 到 4 条",
    `  - ${bodyLineRule}`,
    "  - 变更极其琐碎时（如仅修正错别字）可省略正文",
    "- 首行（含 type、scope、描述）不超过 100 字符",
  ];
  if (strictMode) {
    lines.push("- 本次为严格模式：输出会被机器校验，任何格式偏差都会被退回重写，务必逐条满足上述要求");
  }
  return lines.join("\n");
}

export function buildUserPrompt(changeSummary: string): string {
  return `以下是要提交的变更，请概括出这次改动的意图，而不是逐条复述代码：\n\n${changeSummary}`;
}

export function buildRepairPrompt(previousMessage: string, problems: readonly string[]): string {
  return [
    "你上一次的输出不符合 Conventional Commits 规范，存在以下问题：",
    ...problems.map((problem) => `- ${problem}`),
    "",
    "上一次的输出：",
    previousMessage,
    "",
    "请重新生成，只输出修正后的提交消息，不要解释。",
  ].join("\n");
}

export function buildConnectionTestPrompt(): string {
  return "这是一次连接测试。请只回复两个字：正常";
}
