import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIStream } from "../src/engine/runtime/OpenAIStream";
import { parseOpenAIResponse } from "../src/engine/runtime/OpenAIResponseParser";

test("SSE decodes split UTF-8 and CRLF, publishes text before completion and preserves usage", () => {
  const updates: string[] = [];
  const stream = new OpenAIStream(text => updates.push(text));
  const decoder = new TextDecoder();
  const first = new TextEncoder().encode(': heartbeat\r\n\r\ndata: {"choices":[{"index":0,"delta":{"content":"莉娅"}}]}\r\n\r\n');
  for (const byte of first) stream.push(decoder.decode(new Uint8Array([byte]), { stream: true }));
  assert.deepEqual(updates, ["莉娅"]);
  stream.push('data: {"choices":[{"index":0,"delta":{"content":"走来","reasoning":"not displayable"},"finish_reason":"stop"}]}\n\ndata: {"choices":[],"usage":{"total_tokens":9}}\n\ndata: [DONE]\n\n');
  const result = parseOpenAIResponse(stream.finish());
  assert.equal(result.content, "莉娅走来");
  assert.equal(result.tokenUsage?.total, 9);
});

test("parallel response accumulators never mix different characters", () => {
  const a: string[] = [], b: string[] = [];
  const left = new OpenAIStream(text => a.push(text)), right = new OpenAIStream(text => b.push(text));
  left.push('data: {"choices":[{"delta":{"content":"莉"}}]}\n\n');
  right.push('data: {"choices":[{"delta":{"content":"苏珊"}}]}\n\n');
  left.push('data: {"choices":[{"delta":{"content":"娅"}}]}\n\ndata: [DONE]\n\n');
  right.push('data: [DONE]\n\n');
  assert.equal(parseOpenAIResponse(left.finish()).content, "莉娅");
  assert.equal(parseOpenAIResponse(right.finish()).content, "苏珊");
  assert.deepEqual(a, ["莉", "莉娅"]); assert.deepEqual(b, ["苏珊"]);
});

test("truncated/error streams and output length limits fail instead of committing partial output", () => {
  const partial = new OpenAIStream(() => {});
  partial.push('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
  assert.throws(() => partial.finish(), /意外中断/);
  assert.throws(() => new OpenAIStream(() => {}).push('data: {"error":{"message":"provider failed"}}\n\n'), /provider failed/);
  assert.throws(() => new OpenAIStream(() => {}).push('data: {"choices":[{"finish_reason":"length"}]}\n\n'), /输出上限/);
});
