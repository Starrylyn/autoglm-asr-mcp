import assert from "node:assert/strict";
import test from "node:test";

import { APIError, ASRError, ConfigError } from "../dist/errors.js";

test("APIError.fromResponse sets retryable for 500", () => {
  const err = APIError.fromResponse(500, "Internal Server Error");
  assert.ok(err instanceof ASRError);
  assert.equal(err.statusCode, 500);
  assert.equal(err.retryable, true);
  assert.match(err.message, /500/);
});

test("APIError.fromResponse is not retryable for 400", () => {
  const err = APIError.fromResponse(400, "Bad Request");
  assert.equal(err.statusCode, 400);
  assert.equal(err.retryable, false);
});

test("APIError.maxRetriesExceeded preserves cause", () => {
  const last = APIError.fromResponse(500, "Internal Server Error");
  const err = APIError.maxRetriesExceeded(3, last);
  assert.equal(err.retryable, false);
  assert.equal(err.cause, last);
  assert.match(err.message, /after 3 attempts/);
  assert.ok(err.message.includes(String(last)));
});

test("ConfigError.missingApiKey returns CONFIG_ERROR", () => {
  const err = ConfigError.missingApiKey();
  assert.equal(err.code, "CONFIG_ERROR");
  assert.match(err.message, /AUTOGLM_ASR_API_KEY/);
});
