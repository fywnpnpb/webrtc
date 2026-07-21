import assert from "node:assert/strict";
import test from "node:test";
import { startTestContext } from "./helpers/test-context.mjs";

test("コマンド照会は必要項目を返し、不明な ID は 404 になる", async (t) => {
  const context = await startTestContext();
  t.after(() => context.close());
  const created = (await context.api.command({ deviceId: "101", type: "register" })).command;
  const queried = await context.api.commandStatus(created.commandId);
  for (const key of ["id", "deviceId", "type", "status", "result", "error", "createdAt", "deliveredAt", "completedAt"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(queried.command, key), key);
  }
  await assert.rejects(context.api.commandStatus("unknown-command"), /404/);
});
