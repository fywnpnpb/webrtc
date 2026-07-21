import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { publicTestEConfig } from "../config/load-config.mjs";
import { normalizeTestEEvent, validateTestEEvent } from "../shared/event-protocol.mjs";
import { readJsonBody, sendJson } from "./http-utils.mjs";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

function nowIso() {
  return new Date().toISOString();
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function expectedAuthUser(config, deviceId) {
  return Object.values(config.devices).find((device) => String(device.deviceId) === String(deviceId))?.authUser || "";
}

function actualSipUser(sipUri) {
  return String(sipUri || "").replace(/^sip:/i, "").split("@")[0];
}

export function createTestEServer(config) {
  const commands = new Map();
  let events = [];

  function publicCommand(command) {
    return {
      ...command,
      result: command.result || {},
      error: command.error || null,
    };
  }

  function createCommand(body) {
    const deviceId = String(body.deviceId || "").trim();
    const type = String(body.type || body.command || "").trim();
    if (!deviceId) throw Object.assign(new Error("deviceId は必須です。"), { statusCode: 400 });
    if (!type) throw Object.assign(new Error("type は必須です。"), { statusCode: 400 });
    const commandId = String(body.commandId || body.id || `cmd-${crypto.randomUUID()}`);
    if (commands.has(commandId)) return commands.get(commandId);
    const command = {
      ...body,
      id: commandId,
      commandId,
      deviceId,
      type,
      status: "queued",
      createdAt: nowIso(),
      deliveredAt: null,
      completedAt: null,
      result: null,
      error: null,
    };
    commands.set(commandId, command);
    return command;
  }

  function commandsForDevice(deviceId) {
    const matching = [...commands.values()]
      .filter((command) => command.deviceId === deviceId)
      .filter((command) => command.status === "queued" || command.status === "delivered")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const command of matching) {
      if (command.status === "queued") {
        command.status = "delivered";
        command.deliveredAt = nowIso();
      }
    }
    return matching.map(publicCommand);
  }

  function completeCommand(commandId, body) {
    const command = commands.get(commandId);
    if (!command) throw Object.assign(new Error("指定されたコマンドが見つかりません。"), { statusCode: 404 });
    const failed = body.ok === false || body.status === "failed";
    command.status = failed ? "failed" : "completed";
    command.completedAt = nowIso();
    command.result = body.result || body;
    command.error = failed ? String(body.error || body.result?.error || "コマンドの実行に失敗しました。") : null;
    return command;
  }

  function addEvent(body) {
    const event = normalizeTestEEvent(body);
    const validation = validateTestEEvent(event);
    if (!validation.valid) {
      throw Object.assign(new Error(`イベント形式が不正です: ${validation.missing.join(", ")}`), { statusCode: 400 });
    }
    event.eventId ||= `evt-${crypto.randomUUID()}`;
    event.receivedAt = nowIso();
    events.push(event);
    if (events.length > 1000) events = events.slice(-1000);
    return event;
  }

  function deviceStatus(deviceId) {
    const deviceEvents = events.filter((event) => event.deviceId === String(deviceId));
    const latest = deviceEvents.at(-1) || null;
    const latestHeartbeat = [...deviceEvents].reverse().find((event) => event.event === "agent.heartbeat") || null;
    const latestWithSip = [...deviceEvents].reverse().find((event) => event.data?.sipUri);
    const latestCommand = [...commands.values()].reverse().find((command) => command.deviceId === String(deviceId)) || null;
    const latestErrorCommand = [...commands.values()].reverse().find((command) => command.deviceId === String(deviceId) && command.error) || null;
    const latestWithCall = [...deviceEvents].reverse().find((event) => event.callId) || null;
    const sipUri = latestWithSip?.data?.sipUri || "";
    const expectedUser = expectedAuthUser(config, deviceId);
    const actualUser = actualSipUser(sipUri);
    const latestMs = latestHeartbeat?.timestamp || NaN;
    const stale = !Number.isFinite(latestMs) || Date.now() - latestMs > 60000;
    const registered = [...deviceEvents].reverse().find((event) => event.data?.registrationState)?.data?.registrationState === "REGISTERED";
    const identityMatches = Boolean(expectedUser && actualUser && expectedUser === actualUser);
    return {
      deviceId: String(deviceId),
      ok: registered && !stale && identityMatches,
      online: !stale,
      registered,
      stale,
      latestAt: latestHeartbeat ? new Date(latestHeartbeat.timestamp).toISOString() : null,
      latestHeartbeatAt: latestHeartbeat ? new Date(latestHeartbeat.timestamp).toISOString() : null,
      latestEventType: latest?.event || null,
      registrationState: [...deviceEvents].reverse().find((event) => event.data?.registrationState)?.data?.registrationState || null,
      callState: [...deviceEvents].reverse().find((event) => event.data?.callState)?.data?.callState || null,
      sipUri,
      expectedSipUser: expectedUser || null,
      actualSipUser: actualUser || null,
      identityMatches,
      eventCount: deviceEvents.length,
      currentCommandId: latestCommand?.commandId || null,
      currentCommandType: latestCommand?.type || null,
      currentCommandStatus: latestCommand?.status || null,
      latestError: latestErrorCommand?.error || null,
      latestCallId: latestWithCall?.callId || null,
    };
  }

  function sendPublicFile(response, pathname) {
    const routes = { "/": "dashboard.html", "/dashboard": "dashboard.html", "/provisioning": "provisioning.html" };
    const relative = routes[pathname] || decodeURIComponent(pathname).replace(/^\/+/, "");
    const filePath = path.resolve(publicDir, relative);
    if (!filePath.startsWith(`${publicDir}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(response);
    return true;
  }

  const server = http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") return sendJson(response, 204, {});
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      const pathname = url.pathname;
      const deviceCommands = pathname.match(/^\/devices\/([^/]+)\/commands$/);
      const deviceStatusMatch = pathname.match(/^\/devices\/([^/]+)\/status$/);
      const commandMatch = pathname.match(/^\/commands\/([^/]+)$/);
      const commandDone = pathname.match(/^\/commands\/([^/]+)\/done$/);

      if (request.method === "GET" && pathname === "/config") return sendJson(response, 200, publicTestEConfig(config));
      if (request.method === "GET" && pathname === "/health") {
        return sendJson(response, 200, { status: "ok", commands: commands.size, events: events.length });
      }
      if (request.method === "GET" && pathname === "/devices") {
        const ids = url.searchParams.get("ids")?.split(",").filter(Boolean)
          || Object.values(config.devices).map((device) => device.deviceId);
        return sendJson(response, 200, { status: "ok", devices: ids.map(deviceStatus) });
      }
      if (request.method === "GET" && deviceStatusMatch) {
        return sendJson(response, 200, { status: "ok", device: deviceStatus(decodeURIComponent(deviceStatusMatch[1])) });
      }
      if (request.method === "POST" && pathname === "/commands") {
        const command = createCommand(await readJsonBody(request));
        return sendJson(response, 201, { status: "ok", command: publicCommand(command) });
      }
      if (request.method === "GET" && pathname === "/commands") {
        return sendJson(response, 200, { status: "ok", commands: [...commands.values()].map(publicCommand) });
      }
      if (request.method === "GET" && commandMatch) {
        const command = commands.get(decodeURIComponent(commandMatch[1]));
        if (!command) throw Object.assign(new Error("指定されたコマンドが見つかりません。"), { statusCode: 404 });
        const value = publicCommand(command);
        return sendJson(response, 200, { status: "ok", command: value, ...value });
      }
      if (request.method === "GET" && deviceCommands) {
        return sendJson(response, 200, { status: "ok", commands: commandsForDevice(decodeURIComponent(deviceCommands[1])) });
      }
      if (request.method === "POST" && commandDone) {
        const command = completeCommand(decodeURIComponent(commandDone[1]), await readJsonBody(request));
        return sendJson(response, 200, { status: "ok", command: publicCommand(command) });
      }
      if (request.method === "POST" && pathname === "/commands/reset") {
        const count = commands.size;
        commands.clear();
        return sendJson(response, 200, { status: "ok", reset: { commands: count } });
      }
      if (request.method === "POST" && pathname === "/events") {
        return sendJson(response, 201, { status: "ok", event: addEvent(await readJsonBody(request)) });
      }
      if (request.method === "GET" && pathname === "/events") {
        const deviceId = url.searchParams.get("deviceId");
        return sendJson(response, 200, { status: "ok", events: deviceId ? events.filter((event) => event.deviceId === deviceId) : events });
      }
      if (request.method === "POST" && pathname === "/events/reset") {
        const count = events.length;
        events = [];
        return sendJson(response, 200, { status: "ok", reset: { events: count } });
      }
      if (request.method === "POST" && pathname === "/reset") {
        const reset = { commands: commands.size, events: events.length };
        commands.clear();
        events = [];
        return sendJson(response, 200, { status: "ok", reset });
      }
      if (request.method === "GET" && sendPublicFile(response, pathname)) return;
      return sendJson(response, 404, { status: "error", message: "指定されたリソースが見つかりません。" });
    } catch (error) {
      return sendJson(response, error.statusCode || 500, { status: "error", message: error.message || "サーバー内部エラーが発生しました。" });
    }
  });

  return {
    start() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.server.port, config.server.host, () => {
          server.off("error", reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
