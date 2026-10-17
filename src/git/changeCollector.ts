import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FileSection } from "../core/types";

const execFileAsync = promisify(execFile);

interface GitRepositoryLike {
  rootUri: { fsPath: string };
}

export async function collectStagedChanges(repository: GitRepositoryLike): Promise<FileSection[]> {
  const cwd = repository.rootUri.fsPath;
  const names = await runGit(cwd, ["diff", "--cached", "--name-status", "-z"]);
  if (names.trim() === "") {
    return [];
  }

  // 显式开启重命名检测，否则部分 Git 配置会把重命名拆成删除加新增。
  const diff = await runGit(cwd, [
    "diff",
    "--cached",
    "--find-renames",
    "--no-color",
    "--no-ext-diff",
    "--unified=3",
    "--",
  ]);
  return parseStagedChanges(names, diff);
}

export function parseStagedChanges(nameStatusOutput: string, diffOutput: string): FileSection[] {
  const entries = parseNameStatus(nameStatusOutput);
  if (entries.length === 0) {
    return [];
  }
  const diffs = splitDiffs(diffOutput);
  return entries.map((entry) => {
    const diffText = diffs.get(entry.path) ?? "";
    return {
      path: entry.path,
      status: entry.status,
      binary: /^Binary files .* differ$/m.test(diffText) || /^GIT binary patch$/m.test(diffText),
      diffText,
    };
  });
}

interface NameStatusEntry {
  path: string;
  status: string;
}

function parseNameStatus(output: string): NameStatusEntry[] {
  const tokens = output.split("\0").filter((token) => token !== "");
  const entries: NameStatusEntry[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const statusCode = tokens[index];
    const code = statusCode.charAt(0);
    if (code === "R" || code === "C") {
      const oldPath = tokens[index + 1];
      const newPath = tokens[index + 2];
      if (oldPath == null || newPath == null) {
        break;
      }
      entries.push({
        path: normalizePath(newPath),
        status: code === "R" ? `重命名（原 ${normalizePath(oldPath)}）` : "复制",
      });
      index += 2;
      continue;
    }
    const path = tokens[index + 1];
    if (path == null) {
      break;
    }
    entries.push({ path: normalizePath(path), status: statusLabel(code) });
    index += 1;
  }
  return entries;
}

function statusLabel(code: string): string {
  switch (code) {
    case "A":
      return "新增";
    case "D":
      return "删除";
    case "M":
      return "修改";
    case "T":
      return "类型变更";
    case "U":
      return "冲突";
    default:
      return "修改";
  }
}

/**
 * 按 diff --git 行切分，保留每个文件完整的 diff 片段。
 */
function splitDiffs(output: string): Map<string, string> {
  const result = new Map<string, string>();
  const starts: Array<{ index: number; path: string }> = [];
  const header = /^diff --git a\/(.+?) b\/(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = header.exec(output)) !== null) {
    starts.push({ index: match.index, path: normalizePath(match[2]) });
  }
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = starts[index + 1]?.index ?? output.length;
    result.set(start.path, output.slice(start.index, end));
  }
  return result;
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`读取 Git 暂存区失败：${message}`);
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
