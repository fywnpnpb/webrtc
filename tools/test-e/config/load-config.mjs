import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
export const configPath = path.join(configDir, "test-e.config.json");

function numberFromEnv(name, fallback) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number.`);
  return parsed;
}

export function loadTestEConfig() {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const devices = Object.fromEntries(Object.entries(config.devices).map(([slot, device]) => {
    const deviceId = process.env[`IVR_E_DEVICE_${slot}_ID`] || String(device.deviceId);
    const authUser = process.env[`IVR_E_DEVICE_${slot}_AUTH_USER`] || String(device.authUser);
    return [slot, { deviceId, authUser }];
  }));

  return {
    ...config,
    server: {
      host: process.env.TEST_COMMAND_HOST || config.server.host,
      port: numberFromEnv("TEST_COMMAND_PORT", config.server.port),
    },
    sip: {
      wsUrl: process.env.IVR_E_SIP_WS_URL || config.sip.wsUrl,
      domain: process.env.IVR_E_SIP_DOMAIN || config.sip.domain,
      password: process.env.IVR_E_SIP_PASSWORD || config.sip.password,
    },
    devices,
    external: {
      ...config.external,
      inboundPhone: process.env.IVR_E_INBOUND_PHONE || config.external.inboundPhone,
      outboundPhone: process.env.IVR_E_OUTBOUND_PHONE || config.external.outboundPhone,
      calltestBaseUrl: process.env.IVR_E_CALLTEST_BASE || config.external.calltestBaseUrl,
    },
    timings: {
      connectedSec: numberFromEnv("IVR_E_CONNECTED_SEC", config.timings.connectedSec),
      answerAfterSec: numberFromEnv("IVR_E_ANSWER_AFTER_SEC", config.timings.answerAfterSec),
      transferAfterSec: numberFromEnv("IVR_E_TRANSFER_AFTER_SEC", config.timings.transferAfterSec),
      secondTransferAfterSec: numberFromEnv("IVR_E_SECOND_TRANSFER_AFTER_SEC", config.timings.secondTransferAfterSec),
      beforeAnswerHangupSec: numberFromEnv("IVR_E_BEFORE_ANSWER_HANGUP_SEC", config.timings.beforeAnswerHangupSec),
      beforeTransferAnswerHangupSec: numberFromEnv("IVR_E_BEFORE_TRANSFER_ANSWER_HANGUP_SEC", config.timings.beforeTransferAnswerHangupSec),
      settleSec: numberFromEnv("IVR_E_SECOND_HANGUP_DELAY_SEC", config.timings.settleSec),
      incomingTimeoutSec: numberFromEnv("IVR_E_INCOMING_TIMEOUT_SEC", config.timings.incomingTimeoutSec),
      toleranceSec: numberFromEnv("IVR_E_TOLERANCE_SEC", config.timings.toleranceSec),
      commandTimeoutSec: config.timings.commandTimeoutSec,
    },
  };
}

export function publicTestEConfig(config = loadTestEConfig()) {
  return {
    server: config.server,
    sip: config.sip,
    devices: config.devices,
  };
}
