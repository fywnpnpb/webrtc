import assert from "node:assert/strict";
import test from "node:test";
import { FakeAgent, startTestContext } from "./helpers/test-context.mjs";

test("旧 heartbeat は agent.heartbeat に変換される", async (t) => {
  const context = await startTestContext();
  t.after(() => context.close());
  const agent = new FakeAgent(context.api, "101");
  await agent.heartbeat(true);
  const events = (await context.api.events()).events;
  assert.equal(events.at(-1).event, "agent.heartbeat");
  assert.equal(events.at(-1).commandId, null);
  assert.equal(events.at(-1).callId, null);
  assert.equal((await context.api.device("101")).device.online, true);
  assert.equal((await context.api.device("102")).device.online, false);
});
