import assert from "node:assert/strict";
import test from "node:test";
import { TestERunner } from "../runner/IVRAutoTestE.mjs";
import { CommandTimeoutError } from "../runner/errors.mjs";
import { startTestContext, testConfig } from "./helpers/test-context.mjs";

test("Agent が応答しない場合はコマンドタイムアウトになる", async (t) => {
  const config = testConfig();
  config.timings.commandTimeoutSec.call = 0.05;
  const context = await startTestContext(config);
  t.after(() => context.close());
  const runner = new TestERunner({ config, api: context.api });
  await assert.rejects(runner.send("A", "call", { to: "webrtc_102" }), (error) => {
    assert.ok(error instanceof CommandTimeoutError);
    assert.equal(error.deviceId, "101");
    assert.equal(error.commandType, "call");
    return true;
  });
});
