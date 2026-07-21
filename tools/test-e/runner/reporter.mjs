import fs from "node:fs";
import path from "node:path";

function createRunId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "");
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/password|authorization|credential|secret/i.test(key)) return [key, "[REDACTED]"];
    return [key, sanitize(item)];
  }));
}

export class RunReporter {
  constructor(options = {}) {
    this.runId = options.runId || createRunId();
    this.outputRoot = options.outputRoot || path.resolve("test-results");
    this.outputDir = path.join(this.outputRoot, this.runId);
    this.lines = [];
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  record(entry) {
    const line = sanitize({
      timestamp: new Date().toISOString(),
      deviceId: null,
      commandId: null,
      commandType: null,
      commandStatus: null,
      callId: null,
      error: null,
      ...entry,
    });
    this.lines.push(JSON.stringify(line));
    fs.appendFileSync(path.join(this.outputDir, "runner.log"), `${JSON.stringify(line)}\n`, "utf8");
  }

  async finalize(api, summary) {
    let commands = [];
    let events = [];
    try { commands = (await api.get("/commands")).commands || []; } catch (error) { this.record({ error: `コマンド取得失敗: ${error.message}` }); }
    try { events = (await api.events()).events || []; } catch (error) { this.record({ error: `イベント取得失敗: ${error.message}` }); }
    fs.writeFileSync(path.join(this.outputDir, "summary.json"), JSON.stringify(sanitize({ runId: this.runId, ...summary }), null, 2), "utf8");
    fs.writeFileSync(path.join(this.outputDir, "commands.json"), JSON.stringify(sanitize(commands), null, 2), "utf8");
    fs.writeFileSync(path.join(this.outputDir, "events.json"), JSON.stringify(sanitize(events), null, 2), "utf8");
    return this.outputDir;
  }
}
