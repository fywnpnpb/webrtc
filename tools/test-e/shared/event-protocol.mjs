const EVENT_ALIASES = new Map([
  ["heartbeat", "agent.heartbeat"],
  ["agent.heartbeat", "agent.heartbeat"],
  ["registration.registered", "sip.registered"],
  ["registration.failed", "sip.registration.failed"],
  ["outgoing.started", "call.outgoing"],
  ["incoming.received", "call.incoming"],
  ["call.accepted", "call.answered"],
  ["call.confirmed", "call.connected"],
  ["call.hold", "call.hold"],
  ["call.resumed", "call.resumed"],
  ["call.ended", "call.ended"],
  ["call.failed", "call.failed"],
  ["call.rejected", "call.rejected"],
  ["transfer.started", "call.transfer.started"],
  ["transfer.accepted", "call.transfer.succeeded"],
  ["transfer.failed", "call.transfer.failed"],
]);

function normalizeEventName(body) {
  const source = String(body.event || body.type || "event");
  if (source === "registration.state") {
    if (body.registrationState === "REGISTERED") return "sip.registered";
    if (body.registrationState === "UNREGISTERED") return "sip.unregistered";
    return "sip.registration.state";
  }
  return EVENT_ALIASES.get(source) || source;
}

function normalizeTimestamp(body, now) {
  const direct = Number(body.timestamp);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const parsed = new Date(body.at || body.receivedAt || "").getTime();
  return Number.isFinite(parsed) ? parsed : now;
}

export function normalizeTestEEvent(body, now = Date.now()) {
  const data = { ...(body.details || {}), ...(body.data || {}) };
  if (body.registrationState != null) data.registrationState = body.registrationState;
  if (body.callState != null) data.callState = body.callState;
  if (body.currentRemoteLabel != null) data.currentRemoteLabel = body.currentRemoteLabel;

  return {
    eventId: body.eventId || null,
    deviceId: body.deviceId == null ? null : String(body.deviceId),
    event: normalizeEventName(body),
    timestamp: normalizeTimestamp(body, now),
    commandId: body.commandId ?? data.commandId ?? null,
    callId: body.callId ?? data.callId ?? data.call_id ?? null,
    data,
  };
}

export function validateTestEEvent(event) {
  const missing = ["deviceId", "event", "timestamp", "commandId", "callId"]
    .filter((key) => !Object.prototype.hasOwnProperty.call(event, key));
  return { valid: missing.length === 0 && Boolean(event.deviceId), missing };
}
