import assert from "node:assert/strict";
import test from "node:test";

import { getConfig } from "../dist/config.js";
import { ConfigError } from "../dist/errors.js";

function withEnv(key, value, fn) {
  const old = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    if (old === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = old;
    }
  }
}

test("getConfig throws ConfigError when API key missing", () => {
  withEnv("AUTOGLM_ASR_API_KEY", undefined, () => {
    assert.throws(
      () => getConfig(),
      (err) => err instanceof ConfigError,
    );
  });
});

test("getConfig returns defaults when env not set", () => {
  withEnv("AUTOGLM_ASR_API_KEY", "test-key", () => {
    const cfg = getConfig();
    assert.equal(cfg.apiBase, "https://api.chatglm.cn/v1/chat/completions");
    assert.equal(cfg.model, "autoglm-asr-nano-vllm");
    assert.equal(cfg.maxChunkDuration, 25);
    assert.equal(cfg.maxConcurrency, 5);
    assert.equal(cfg.contextMaxChars, 2000);
    assert.equal(cfg.requestTimeout, 60);
    assert.equal(cfg.maxRetries, 2);
  });
});
