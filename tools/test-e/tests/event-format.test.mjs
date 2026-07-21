import assert from "node:assert/strict";
import test from "node:test";
import { startTestContext } from "./helpers/test-context.mjs";

test("イベントは統一 JSON 形式と安定した callId を保持する", async (t) => {
  const context = await startTestContext();
  t.after(() => context.close());
  for (const event of ["call.outgoing", "call.connected", "call.ended"]) {
    await context.api.post("/events", { deviceId: "101", event, timestamp: Date.now(), commandId: "cmd-1", callId: "call-1", data: {} });
  }
  const events = (await context.api.events()).events;
  for (const event of events) {
    assert.deepEqual(Object.keys(event).filter((key) => ["deviceId", "event", "timestamp", "commandId", "callId"].includes(key)).sort(), ["callId", "commandId", "deviceId", "event", "timestamp"]);
    assert.equal(event.callId, "call-1");
  }
  const missingCallId = await context.api.post("/events", { deviceId: "102", event: "call.incoming", timestamp: Date.now(), commandId: null, data: {} });
  assert.equal(missingCallId.event.callId, null);
});
