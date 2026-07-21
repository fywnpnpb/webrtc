import { createTestEServer } from "../../server/server.mjs";
import { TestEApiClient } from "../../runner/api-client.mjs";

export function testConfig(overrides = {}) {
  return {
    server: { host: "127.0.0.1", port: 0 },
    sip: { wsUrl: "wss://example.invalid/ws", domain: "example.invalid", password: "test" },
    devices: {
      A: { deviceId: "101", authUser: "webrtc_101" },
      B: { deviceId: "102", authUser: "webrtc_102" },
      C: { deviceId: "103", authUser: "webrtc_103" },
    },
    external: { inboundPhone: "05000000000", outboundPhone: "05000000000", calltestBaseUrl: "http://127.0.0.1/" },
    timings: {
      connectedSec: 1,
      answerAfterSec: 0,
      transferAfterSec: 0,
      secondTransferAfterSec: 0,
      beforeAnswerHangupSec: 0,
      beforeTransferAnswerHangupSec: 0,
      settleSec: 0,
      incomingTimeoutSec: 1,
      toleranceSec: 1,
      commandTimeoutSec: { register: 0.2, call: 0.2, answer: 0.2, hangup: 0.2, transfer: 0.2, default: 0.2 },
    },
    ...overrides,
  };
}

export async function startTestContext(config = testConfig()) {
  const server = createTestEServer(config);
  const address = await server.start();
  const api = new TestEApiClient(`http://127.0.0.1:${address.port}`);
  return { config, server, api, close: () => server.close() };
}

export class FakeAgent {
  constructor(api, deviceId, handlers = {}) {
    this.api = api;
    this.deviceId = deviceId;
    this.handlers = handlers;
    this.results = new Map();
    this.executionCounts = new Map();
  }

  async pollOnce() {
    const response = await this.api.get(`/devices/${this.deviceId}/commands`);
    for (const command of response.commands) {
      let outcome = this.results.get(command.commandId);
      if (!outcome) {
        this.executionCounts.set(command.commandId, (this.executionCounts.get(command.commandId) || 0) + 1);
        try {
          const handler = this.handlers[command.type];
          if (!handler) throw new Error("未対応の Fake Agent コマンドです。");
          const result = await handler(command);
          outcome = result?.ok === false ? result : { ok: true, ...(result || {}) };
        } catch (error) {
          outcome = { ok: false, error: error.message };
        }
        this.results.set(command.commandId, outcome);
      }
      await this.api.post(`/commands/${command.commandId}/done`, outcome);
    }
  }

  async heartbeat(legacy = false) {
    return this.api.post("/events", legacy ? {
      deviceId: this.deviceId,
      type: "heartbeat",
      registrationState: "REGISTERED",
      callState: "IDLE",
      details: { sipUri: `sip:webrtc_${this.deviceId}@example.invalid` },
    } : {
      deviceId: this.deviceId,
      event: "agent.heartbeat",
      timestamp: Date.now(),
      commandId: null,
      callId: null,
      data: { registrationState: "REGISTERED", callState: "IDLE", sipUri: `sip:webrtc_${this.deviceId}@example.invalid` },
    });
  }
}
