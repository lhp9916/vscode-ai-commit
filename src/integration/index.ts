import * as assert from "node:assert/strict";
import * as vscode from "vscode";

interface GitExtension {
  getAPI(version: 1): {
    repositories: Array<{
      rootUri: vscode.Uri;
      inputBox: { value: string };
    }>;
  };
}

interface StubServer {
  url: string;
  close(): Promise<void>;
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension("peng.vscode-ai-commit");
  assert.ok(extension, "扩展未加载");
  await extension.activate();
  console.log("[integration] extension activated");

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("aiCommit.generateMessage"), "生成命令未注册");
  assert.ok(commands.includes("aiCommit.openSettings"), "设置命令未注册");
  console.log("[integration] commands registered");

  const gitExtension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  assert.ok(gitExtension, "内置 Git 扩展不可用");
  const git = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
  console.log("[integration] git extension activated");
  await waitForRepository(git);
  console.log("[integration] repository discovered");

  const server = await startStubServer();
  const configuration = vscode.workspace.getConfiguration("aiCommit");
  try {
    await configuration.update("provider", "custom", vscode.ConfigurationTarget.Global);
    await configuration.update("baseUrl", server.url, vscode.ConfigurationTarget.Global);
    await configuration.update("model", "integration-model", vscode.ConfigurationTarget.Global);
    await configuration.update("strictMode", false, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand("aiCommit._test.setApiKey", "integration-key");
    console.log("[integration] settings configured");
    await vscode.commands.executeCommand("aiCommit.generateMessage");
    console.log("[integration] generate command invoked");

    const repository = git.getAPI(1).repositories[0];
    const deadline = Date.now() + 20_000;
    while (repository.inputBox.value === "" && Date.now() < deadline) {
      await delay(100);
    }
    console.log(`[integration] input box=${repository.inputBox.value}`);
    assert.equal(repository.inputBox.value, "fix: 集成测试生成成功");
  } finally {
    await server.close();
    await configuration.update("provider", undefined, vscode.ConfigurationTarget.Global);
    await configuration.update("baseUrl", undefined, vscode.ConfigurationTarget.Global);
    await configuration.update("model", undefined, vscode.ConfigurationTarget.Global);
    await configuration.update("strictMode", undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand("aiCommit._test.setApiKey", "");
  }
}

async function startStubServer(): Promise<StubServer> {
  const http = await import("node:http");
  const server = http.createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        choices: [{ message: { content: "fix: 集成测试生成成功" } }],
      }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForRepository(git: GitExtension): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (git.getAPI(1).repositories.length === 0 && Date.now() < deadline) {
    await delay(100);
  }
  assert.ok(git.getAPI(1).repositories.length > 0, "集成测试工作区不是 Git 仓库");
}
