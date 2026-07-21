import assert from "node:assert/strict";
import test from "node:test";
import { FakeAgent, startTestContext } from "./helpers/test-context.mjs";

test("成功したコマンドは completed、失敗したコマンドは failed になる", async (t) => {
  const context = await startTestContext();
  t.after(() => context.close());
  const agent = new FakeAgent(context.api, "101", {
    register: async () => ({ ok: true }),
    call: async () => ({ ok: false, error: "SIP 404 Not Found" }),
  });
  const register = (await context.api.command({ deviceId: "101", type: "register" })).command;
  const call = (await context.api.command({ deviceId: "101", type: "call", to: "webrtc_102" })).command;
  await agent.pollOnce();
  assert.equal((await context.api.commandStatus(register.commandId)).command.status, "completed");
  const failed = (await context.api.commandStatus(call.commandId)).command;
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "SIP 404 Not Found");
});
