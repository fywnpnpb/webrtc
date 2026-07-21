import assert from "node:assert/strict";
import test from "node:test";
import { FakeAgent, startTestContext } from "./helpers/test-context.mjs";

test("同じ commandId は副作用を一度だけ実行する", async (t) => {
  const context = await startTestContext();
  t.after(() => context.close());
  let calls = 0;
  const agent = new FakeAgent(context.api, "101", { call: async () => { calls += 1; return { ok: true }; } });
  const commandId = "fixed-command-id";
  await context.api.command({ commandId, deviceId: "101", type: "call", to: "webrtc_102" });
  await agent.pollOnce();
  await context.api.command({ commandId, deviceId: "101", type: "call", to: "webrtc_102" });
  await agent.pollOnce();
  assert.equal(calls, 1);
  assert.equal(agent.executionCounts.get(commandId), 1);
});
