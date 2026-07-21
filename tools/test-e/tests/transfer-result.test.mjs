import assert from "node:assert/strict";
import test from "node:test";
import { waitForTransferResult } from "../shared/transfer-result.mjs";

function fakeSession(result, detail = "") {
  return {
    refer(_target, options) {
      queueMicrotask(() => options.eventHandlers[result](detail ? { cause: detail } : { status_line: { status_code: 202 } }));
    },
  };
}

test("REFER accepted で成功し、requestFailed で失敗する", async () => {
  const succeeded = await waitForTransferResult(fakeSession("accepted"), "sip:webrtc_102@example.invalid", { timeoutMs: 100 });
  assert.equal(succeeded.target, "sip:webrtc_102@example.invalid");
  await assert.rejects(
    waitForTransferResult(fakeSession("requestFailed", "Not Found"), "sip:missing@example.invalid", { timeoutMs: 100 }),
    /Not Found/,
  );
});
