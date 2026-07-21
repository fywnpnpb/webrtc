import assert from "node:assert/strict";
import test from "node:test";
import { TestERunner } from "../runner/IVRAutoTestE.mjs";
import { CommandExecutionError } from "../runner/errors.mjs";
import { FakeAgent, startTestContext } from "./helpers/test-context.mjs";

test("Runner は failed 終端を待ち、詳細付きで即時失敗する", async (t) => {
  const context = await startTestContext();
  t.after(() => context.close());
  const runner = new TestERunner({ config: context.config, api: context.api });
  const agent = new FakeAgent(context.api, "101", { call: async () => ({ ok: false, error: "SIP 404 Not Found" }) });
  let stopped = false;
  const polling = (async () => {
    while (!stopped) {
      await agent.pollOnce();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  })();
  try {
    await assert.rejects(runner.send("A", "call", { to: "webrtc_102" }), (error) => {
      assert.ok(error instanceof CommandExecutionError);
      assert.equal(error.deviceId, "101");
      assert.equal(error.commandType, "call");
      assert.equal(error.commandError, "SIP 404 Not Found");
      return true;
    });
  } finally {
    stopped = true;
    await polling;
  }
});
