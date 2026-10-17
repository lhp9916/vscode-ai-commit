import assert from "node:assert/strict";
import test from "node:test";
import { validateCommitMessage } from "../core/validator";

test("接受合法消息、scope、正文与破坏性变更", () => {
  assert.deepEqual(validateCommitMessage("fix: 修复登录超时"), []);
  assert.deepEqual(
    validateCommitMessage("feat(upload): 添加文件信息日志\n\n- 打印文件信息\n- 便于排查"),
    [],
  );
  assert.deepEqual(
    validateCommitMessage("feat(api)!: 移除 v1 接口\n\n- 统一走 v2\n\nBREAKING CHANGE: 请迁移到 v2"),
    [],
  );
});

test("拒绝非法类型、缺失前缀和过长首行", () => {
  assert.ok(validateCommitMessage("feet: 新增功能").some((item) => item.includes("不在允许范围")));
  assert.ok(validateCommitMessage("修复登录超时")[0].includes("必须符合"));
  assert.ok(validateCommitMessage(`feat: ${"a".repeat(120)}`).some((item) => item.includes("100")));
});

test("拒绝句号、驼峰 scope 与空 scope", () => {
  assert.ok(validateCommitMessage("fix: 修复登录超时。").some((item) => item.includes("句号")));
  assert.ok(validateCommitMessage("fix(uploadFile): 修复上传").some((item) => item.includes("小写")));
  assert.ok(validateCommitMessage("fix(): 修复上传").some((item) => item.includes("空括号")));
});

test("拒绝正文前缺少空行与小写破坏性脚注", () => {
  assert.ok(
    validateCommitMessage("feat(upload): 添加日志\n- 打印日志").some((item) => item.includes("空一行")),
  );
  assert.ok(
    validateCommitMessage("feat(api)!: 移除 v1\n\n- 统一走 v2\n\nbreaking change: 请迁移")
      .some((item) => item.includes("大写")),
  );
});
