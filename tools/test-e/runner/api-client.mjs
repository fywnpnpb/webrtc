export class TestEApiClient {
  constructor(baseUrl) {
    this.baseUrl = String(baseUrl).replace(/\/+$/, "");
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${body.message || text}`);
    return body;
  }

  get(path) { return this.request(path); }
  post(path, body = {}) { return this.request(path, { method: "POST", body: JSON.stringify(body) }); }
  health() { return this.get("/health"); }
  events() { return this.get("/events"); }
  device(deviceId) { return this.get(`/devices/${encodeURIComponent(deviceId)}/status`); }
  command(command) { return this.post("/commands", command); }
  commandStatus(commandId) { return this.get(`/commands/${encodeURIComponent(commandId)}`); }
  reset() { return this.post("/reset"); }
}
