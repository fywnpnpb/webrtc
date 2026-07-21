import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadTestEConfig } from "../config/load-config.mjs";
import { TestEApiClient } from "./api-client.mjs";
import { CalltestClient } from "./calltest-client.mjs";
import { CommandExecutionError, CommandTimeoutError } from "./errors.mjs";

const runnerDir = path.dirname(fileURLToPath(import.meta.url));
export const scenarios = JSON.parse(fs.readFileSync(path.join(runnerDir, "..", "config", "scenarios.json"), "utf8"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function eventTime(event) {
  const value = Number(event?.timestamp);
  return Number.isFinite(value) ? value : 0;
}

function eventCallId(event) {
  return event?.callId || "";
}

export class TestERunner {
  constructor(options = {}) {
    this.config = options.config || loadTestEConfig();
    this.baseUrl = (process.env.IVR_E_WEB_API_BASE || `http://127.0.0.1:${this.config.server.port}`).replace(/\/+$/, "");
    this.api = options.api || new TestEApiClient(this.baseUrl);
    this.calltest = options.calltest || new CalltestClient(this.config.external.calltestBaseUrl);
    this.manualExternal = options.manualExternal === true;
    this.keepRegistered = options.keepRegistered === true;
    this.reporter = options.reporter || null;
  }

  device(slot) {
    const device = this.config.devices[slot];
    if (!device) throw new Error(`Unknown device slot: ${slot}`);
    return device;
  }

  async waitFor(label, check, timeoutMs = 75000, intervalMs = 1000) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() <= deadline) {
      last = await check();
      if (last) return last;
      await sleep(intervalMs);
    }
    throw new Error(`${label} timed out; last=${JSON.stringify(last)}`);
  }

  commandTimeoutMs(type) {
    const seconds = this.config.timings.commandTimeoutSec?.[type]
      ?? this.config.timings.commandTimeoutSec?.default
      ?? 20;
    return Number(seconds) * 1000;
  }

  async waitCommand(commandId, deviceId, commandType) {
    const timeoutMs = this.commandTimeoutMs(commandType);
    const pollIntervalMs = Math.min(300, Math.max(10, timeoutMs / 4));
    const deadline = Date.now() + timeoutMs;
    let command = null;
    while (Date.now() <= deadline) {
      command = (await this.api.commandStatus(commandId)).command;
      if (["completed", "failed"].includes(command.status)) break;
      await sleep(pollIntervalMs);
    }
    if (!command || !["completed", "failed"].includes(command.status)) {
      const error = new CommandTimeoutError({ deviceId, commandId, commandType, status: command?.status || "queued" });
      this.reporter?.record({ deviceId, commandId, commandType, commandStatus: "timeout", error: error.message });
      throw error;
    }
    const errorText = command.error || command.result?.error || null;
    this.reporter?.record({ deviceId, commandId, commandType, commandStatus: command.status, error: errorText });
    if (command.status === "failed") {
      throw new CommandExecutionError(
        `コマンドの実行に失敗しました: deviceId=${deviceId} commandId=${commandId} type=${commandType} error=${errorText || "不明"}`,
        { deviceId, commandId, commandType, status: command.status, commandError: errorText },
      );
    }
    return command;
  }

  async send(slot, type, extra = {}) {
    const deviceId = this.device(slot).deviceId;
    const result = await this.api.command({ deviceId, type, ...extra });
    const commandId = result.command.commandId;
    console.log(`command ${type}: device=${deviceId} id=${commandId}`);
    this.reporter?.record({ deviceId, commandId, commandType: type, commandStatus: "queued" });
    return this.waitCommand(commandId, deviceId, type);
  }

  async status(slot) {
    return (await this.api.device(this.device(slot).deviceId)).device;
  }

  async waitState(slot, callState, since = 0, timeoutMs = 75000) {
    const deviceId = this.device(slot).deviceId;
    return this.waitFor(`${slot} callState=${callState}`, async () => {
      const events = (await this.api.events()).events || [];
      return events.filter((event) => event.deviceId === deviceId && eventTime(event) >= since)
        .find((event) => event.data?.callState === callState) || null;
    }, timeoutMs);
  }

  async waitIncoming(slot, since, timeoutMs = this.config.timings.incomingTimeoutSec * 1000) {
    const deviceId = this.device(slot).deviceId;
    return this.waitFor(`${slot} incoming`, async () => {
      const events = (await this.api.events()).events || [];
      return events.filter((event) => event.deviceId === deviceId && eventTime(event) >= since)
        .find((event) => event.event === "call.incoming" || event.data?.callState === "INCOMING") || null;
    }, timeoutMs);
  }

  async ensureReady(slot) {
    let status = await this.status(slot);
    if (!status.online) {
      status = await this.waitFor(`${slot} Test Agent online`, async () => {
        const next = await this.status(slot);
        return next.online ? next : null;
      }, 35000);
    }
    if (!status.ok) {
      await this.send(slot, "register");
      status = await this.waitFor(`${slot} SIP registered`, async () => {
        const next = await this.status(slot);
        if (next.actualSipUser && next.actualSipUser !== this.device(slot).authUser) {
          throw new Error(`${slot} SIP identity mismatch: expected=${this.device(slot).authUser} actual=${next.actualSipUser}`);
        }
        return next.ok ? next : null;
      }, 75000);
    }
    console.log(`${slot} ready: ${status.deviceId} / ${status.sipUri}`);
    return status;
  }

  async prepare(slots = ["A", "B", "C"]) {
    for (const slot of slots) await this.ensureReady(slot);
  }

  async waitIdle(slots, since) {
    for (const slot of slots) await this.waitState(slot, "IDLE", since, 45000);
  }

  async runInternalSmokeCase(id, hangupSlot, answer = true) {
    const since = Date.now();
    console.log(`\n===== ${id} start =====`);
    await this.send("A", "call", { to: this.device("B").authUser });
    await this.waitIncoming("B", since, 45000);
    if (answer) {
      await sleep(this.config.timings.answerAfterSec * 1000);
      await this.send("B", "answer");
      await this.waitState("B", "INCALL", since, 45000);
    } else {
      await sleep(this.config.timings.beforeAnswerHangupSec * 1000);
    }
    await this.send(hangupSlot, "hangup");
    await this.waitIdle(["A", "B"], since);
    console.log(`RESULT OK ${id}`);
    return true;
  }

  async runSmoke() {
    await this.api.health();
    await this.prepare(["A", "B"]);
    const cases = [
      ["SMOKE-A-HANGUP", "A", true],
      ["SMOKE-B-HANGUP", "B", true],
      ["SMOKE-BEFORE-ANSWER", "A", false],
    ];
    const results = [];
    for (const [id, hangupSlot, answer] of cases) {
      try {
        results.push({ id, ok: await this.runInternalSmokeCase(id, hangupSlot, answer) });
      } catch (error) {
        const routeBlocked = await this.hasSipRouteFailure();
        if (routeBlocked) {
          console.warn(`RESULT BLOCKED_BY_SIP_ROUTE ${id}: SIP サーバーが 404 Not Found を返しました。`);
          results.push({ id, ok: false, blocked: true, reason: "BLOCKED_BY_SIP_ROUTE" });
        } else {
          console.error(`RESULT NG ${id}: ${error.message}`);
          results.push({ id, ok: false, error: error.message });
          try { await this.send("A", "hangup"); } catch {}
          try { await this.send("B", "hangup"); } catch {}
        }
      }
    }
    const ok = results.filter((result) => result.ok).length;
    const blocked = results.filter((result) => result.blocked).length;
    const ng = results.length - ok - blocked;
    console.log(`\n===== Test E smoke: OK=${ok} NG=${ng} BLOCKED=${blocked} total=${results.length} =====`);
    return results;
  }

  async hasSipRouteFailure() {
    const events = (await this.api.events()).events || [];
    return events.some((event) => event.event === "call.failed" && Number(event.data?.statusCode) === 404);
  }

  calltestWaitMs(scenario) {
    const t = this.config.timings;
    if (scenario.hangupBy === "external-before-answer") return Math.max(1, t.beforeAnswerHangupSec * 1000);
    if (scenario.hangupBy === "external-before-transfer-answer") return Math.max(1, (t.answerAfterSec + t.transferAfterSec + t.beforeTransferAnswerHangupSec) * 1000);
    if (scenario.hangupBy === "external") return Math.max(1, (t.answerAfterSec + t.transferAfterSec * (scenario.transfers?.length || 0) + t.answerAfterSec + t.connectedSec) * 1000);
    return Math.max(1, (t.answerAfterSec + t.transferAfterSec * 3 + t.connectedSec + 30) * 1000);
  }

  async startScenarioCall(scenario, since) {
    if (scenario.direction === "inbound" && scenario.caller === "external") {
      if (this.manualExternal) console.log(`MANUAL: call ${this.config.external.inboundPhone} now.`);
      else await this.calltest.run("callOut", { phone: this.config.external.inboundPhone, cmdList: `w${this.calltestWaitMs(scenario)}` });
      await this.waitIncoming(scenario.callee, since);
      return;
    }
    if (scenario.callee === "external") {
      if (this.manualExternal) console.log(`MANUAL: prepare external phone ${this.config.external.outboundPhone}.`);
      else await this.calltest.run("setCallIn", { cmdList: `w${this.calltestWaitMs(scenario)}`, timeToPick: 0 });
      await this.send(scenario.caller, "call", { to: this.config.external.outboundPhone });
      if (scenario.hangupBy !== "caller-before-answer") await this.waitState(scenario.caller, "INCALL", since, 90000);
      return;
    }
    await this.send(scenario.caller, "call", { to: this.device(scenario.callee).authUser });
    await this.waitIncoming(scenario.callee, since);
  }

  async answerInitial(scenario, since) {
    const t = this.config.timings;
    if (scenario.hangupBy === "caller-before-answer") {
      await sleep(t.beforeAnswerHangupSec * 1000);
      await this.send(scenario.caller, "hangup");
      return false;
    }
    if (scenario.hangupBy === "external-before-answer") {
      if (this.manualExternal) console.log("MANUAL: hang up before answer.");
      await sleep((t.beforeAnswerHangupSec + t.settleSec) * 1000);
      return false;
    }
    if (scenario.callee !== "external") {
      await sleep(t.answerAfterSec * 1000);
      await this.send(scenario.callee, "answer");
      await this.waitState(scenario.callee, "INCALL", since, 90000);
    }
    return true;
  }

  async runTransfers(scenario, since) {
    const transfers = scenario.transfers || [];
    for (let index = 0; index < transfers.length; index += 1) {
      const transfer = transfers[index];
      await sleep((index ? this.config.timings.secondTransferAfterSec : this.config.timings.transferAfterSec) * 1000);
      await this.send(transfer.from, "transfer", { to: this.device(transfer.to).authUser, target: this.device(transfer.to).authUser });
      await this.waitIncoming(transfer.to, since);
      const last = index === transfers.length - 1;
      if (last && scenario.hangupBy === "external-before-transfer-answer") {
        if (this.manualExternal) console.log("MANUAL: hang up before transfer answer.");
        await sleep((this.config.timings.beforeTransferAnswerHangupSec + this.config.timings.settleSec) * 1000);
        return false;
      }
      await sleep(this.config.timings.answerAfterSec * 1000);
      await this.send(transfer.to, "answer");
      await this.waitState(transfer.to, "INCALL", since, 90000);
    }
    return true;
  }

  async finishScenario(scenario) {
    const external = ["external", "external-before-answer", "external-before-transfer-answer"].includes(scenario.hangupBy);
    if (external) {
      if (this.manualExternal && scenario.hangupBy === "external") {
        await sleep(this.config.timings.connectedSec * 1000);
        console.log("MANUAL: hang up external phone now.");
      }
      await sleep(this.config.timings.settleSec * 1000);
      return;
    }
    await sleep(this.config.timings.connectedSec * 1000);
    const slot = scenario.hangupBy === "caller" ? scenario.caller : scenario.hangupBy === "callee" ? scenario.callee : scenario.finalAnswer;
    await this.send(slot, "hangup");
    await sleep(this.config.timings.settleSec * 1000);
  }

  async verifyScenario(scenario, since) {
    await sleep(3000);
    const events = (await this.api.events()).events || [];
    const deviceId = this.device(scenario.verifyDevice).deviceId;
    const related = events.filter((event) => event.deviceId === deviceId && eventTime(event) >= since && eventCallId(event));
    const terminal = [...related].reverse().find((event) => ["call.ended", "call.failed"].includes(event.event));
    if (!terminal) throw new Error(`no terminal call event for device ${deviceId}`);
    const callId = eventCallId(terminal);
    const callEvents = related.filter((event) => eventCallId(event) === callId);
    const connected = callEvents.find((event) => ["call.answered", "call.connected"].includes(event.event));
    const expectedMs = connected ? this.config.timings.connectedSec * 1000 : 0;
    const actualMs = connected ? eventTime(terminal) - eventTime(connected) : 0;
    const diffMs = Math.abs(expectedMs - actualMs);
    if (diffMs > this.config.timings.toleranceSec * 1000) throw new Error(`duration mismatch: expected=${expectedMs} actual=${actualMs} diff=${diffMs}`);
    console.log(`RESULT OK ${scenario.id}: callId=${callId} expectedMs=${expectedMs} actualMs=${actualMs}`);
  }

  async runScenario(scenario) {
    console.log(`\n===== ${scenario.id} start =====\n${scenario.label}`);
    const since = Date.now();
    await this.startScenarioCall(scenario, since);
    if (await this.answerInitial(scenario, since)) {
      if (!scenario.transfers?.length || await this.runTransfers(scenario, since)) await this.finishScenario(scenario);
    }
    await this.verifyScenario(scenario, since);
  }

  async runAll(targets = scenarios) {
    await this.api.health();
    await this.prepare();
    const results = [];
    try {
      for (const scenario of targets) {
        try {
          await this.runScenario(scenario);
          results.push({ id: scenario.id, ok: true });
        } catch (error) {
          console.error(`RESULT NG ${scenario.id}: ${error.message}`);
          results.push({ id: scenario.id, ok: false, error: error.message });
        }
      }
    } finally {
      if (!this.keepRegistered) {
        for (const slot of Object.keys(this.config.devices)) {
          try { await this.send(slot, "unregister"); } catch (error) { console.warn(`cleanup ${slot}: ${error.message}`); }
        }
      }
    }
    const ok = results.filter((result) => result.ok).length;
    console.log(`\n===== Test E result: OK=${ok} NG=${results.length - ok} total=${results.length} =====`);
    return results;
  }
}
