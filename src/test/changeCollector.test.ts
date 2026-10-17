import assert from "node:assert/strict";
import test from "node:test";
import { parseStagedChanges } from "../git/changeCollector";

test("解析新增、修改、删除与重命名", () => {
  const names = "M\0src/a.ts\0A\0src/b.ts\0D\0src/c.ts\0R100\0src/old.ts\0src/new.ts\0";
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1 +1 @@",
    "-a",
    "+b",
    "diff --git a/src/b.ts b/src/b.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/src/b.ts",
    "@@ -0,0 +1 @@",
    "+b",
    "",
  ].join("\n");

  const sections = parseStagedChanges(names, diff);
  assert.equal(sections.length, 4);
  assert.deepEqual(
    sections.map((item) => [item.path, item.status]),
    [
      ["src/a.ts", "修改"],
      ["src/b.ts", "新增"],
      ["src/c.ts", "删除"],
      ["src/new.ts", "重命名（原 src/old.ts）"],
    ],
  );
  assert.match(sections[0].diffText, /-a\n\+b/);
  assert.match(sections[1].diffText, /new file mode/);
});

test("识别二进制差异", () => {
  const sections = parseStagedChanges(
    "M\0logo.png\0",
    "diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n",
  );
  assert.equal(sections[0].binary, true);
});

test("空暂存区返回空列表", () => {
  assert.deepEqual(parseStagedChanges("", ""), []);
});
