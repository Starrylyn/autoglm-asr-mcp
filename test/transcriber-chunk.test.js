import assert from "node:assert/strict";
import test from "node:test";

import { ASRTranscriber } from "../dist/transcriber.js";
import { APIError } from "../dist/errors.js";

function createTranscriber() {
  return new ASRTranscriber({
    apiBase: "https://example.invalid/v1/chat/completions",
    apiKey: "test-key",
    model: "autoglm-asr-nano-vllm",
    maxChunkDuration: 25,
    maxConcurrency: 2,
    contextMaxChars: 2000,
    requestTimeout: 1,
    maxRetries: 0,
  });
}

function createChunk() {
  return {
    data: Buffer.from([0, 1, 2, 3]),
    startMs: 0,
    endMs: 1000,
    index: 0,
    isSilent: false,
  };
}

test("transcribeChunk returns content from choices[0].message.content", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      choices: [{ message: { content: "hello" } }],
    }),
  });

  try {
    const t = createTranscriber();
    const text = await t["transcribeChunk"](createChunk(), "");
    assert.equal(text, "hello");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("transcribeChunk returns content from result.content", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      content: "fallback",
    }),
  });

  try {
    const t = createTranscriber();
    const text = await t["transcribeChunk"](createChunk(), "");
    assert.equal(text, "fallback");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("transcribeChunk throws APIError for non-retryable status", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    json: async () => ({}),
  });

  try {
    const t = createTranscriber();
    await assert.rejects(
      t["transcribeChunk"](createChunk(), ""),
      (err) => err instanceof APIError && err.statusCode === 401 && err.retryable === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
