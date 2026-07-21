export class CalltestClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async run(method, params = {}) {
    const url = new URL(this.baseUrl);
    url.searchParams.set("method", method);
    for (const [key, value] of Object.entries(params)) {
      if (value != null) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url);
    const text = await response.text();
    if (!response.ok) throw new Error(`GET ${url} failed: ${response.status} ${text}`);
    console.log(`calltest ${method}: ${text}`);
    return text;
  }
}
