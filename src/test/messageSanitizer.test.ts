import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeMessage } from "../core/messageSanitizer";

test("剥离 Markdown 围栏与语言标记", () => {
  assert.equal(sanitizeMessage("```text\nfeat: 新增导出\n```"), "feat: 新增导出");
});

test("剥离提示性标签", () => {
  assert.equal(sanitizeMessage("提交消息：\nfix: 修复空指针"), "fix: 修复空指针");
});

test("折叠多余空行并保留正文", () => {
  assert.equal(sanitizeMessage("feat: 新增导出\n\n\n\n补充说明"), "feat: 新增导出\n\n补充说明");
});

test("限制行数与处理空值", () => {
  assert.equal(sanitizeMessage("feat: 新增\n正文一\n正文二", 2), "feat: 新增\n正文一");
  assert.equal(sanitizeMessage(null), "");
  assert.equal(sanitizeMessage("  \n "), "");
});
