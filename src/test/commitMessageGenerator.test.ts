import assert from "node:assert/strict";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import test from "node:test";
import { generateCommitMessage } from "../core/commitMessageGenerator";
import { CommitSettings } from "../core/types";

interface RecordedRequest {
  method: string;
  url: string;
  authorization: string;
  body: string;
}

test("完整生成流程发送 OpenAI 兼容请求并清洗结果", async (t) => {
  const requests: RecordedRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({
        method: request.method ?? "",
        url: request.url ?? "",
        authorization: request.headers.authorization ?? "",
        body,
      });
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        choices: [{ message: { content: "```\nfix: 修复上传超时\n```" } }],
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const address = server.address() as AddressInfo;
  const settings: CommitSettings = {
    provider: "custom",
    baseUrl: `http://127.0.0.1:${address.port}`,
    model: "test-model",
    messageStyle: "conventionalZh",
    strictMode: false,
    extraPrompt: "",
    perFileChars: 6000,
    totalChars: 24000,
    timeoutSeconds: 5,
  };

  const message = await generateCommitMessage({
    settings,
    apiKey: "secret",
    sections: [{ path: "src/a.ts", status: "修改", binary: false, diffText: "+a\n" }],
  });

  assert.equal(message, "fix: 修复上传超时");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url, "/chat/completions");
  assert.equal(requests[0].authorization, "Bearer secret");
  const payload = JSON.parse(requests[0].body) as {
    model: string;
    messages: Array<{ role: string; content: string }>;
  };
  assert.equal(payload.model, "test-model");
  assert.equal(payload.messages[0].role, "system");
  assert.match(payload.messages[1].content, /src\/a\.ts/);
});

test("严格模式校验失败时回喂问题并重写一次", async (t) => {
  let callCount = 0;
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    request.resume();
    request.on("end", () => {
      callCount += 1;
      const content = callCount === 1 ? "修复上传超时" : "fix: 修复上传超时";
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const address = server.address() as AddressInfo;
  const message = await generateCommitMessage({
    settings: {
      provider: "custom",
      baseUrl: `http://127.0.0.1:${address.port}`,
      model: "test-model",
      messageStyle: "conventionalZh",
      strictMode: true,
      extraPrompt: "",
      perFileChars: 6000,
      totalChars: 24000,
      timeoutSeconds: 5,
    },
    apiKey: "secret",
    sections: [{ path: "src/a.ts", status: "修改", binary: false, diffText: "+a\n" }],
  });

  assert.equal(callCount, 2);
  assert.equal(message, "fix: 修复上传超时");
});
