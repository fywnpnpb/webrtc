import childProcess from "node:child_process";
import os from "node:os";

import { loadTestEConfig } from "../config/load-config.mjs";
import { createTestEServer } from "./server.mjs";

const config = loadTestEConfig();
const server = createTestEServer(config);
const baseUrl = `http://127.0.0.1:${config.server.port}`;

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((entry) => entry?.family === "IPv4" && !entry.internal).map((entry) => entry.address);
}

function openBrowser(url) {
  const commands = {
    win32: ["cmd", ["/c", "start", "", url]],
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
  };
  const [command, args] = commands[process.platform] || commands.linux;
  const child = childProcess.spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

await server.start();
console.log(`Test E API: ${baseUrl}`);
console.log(`Dashboard: ${baseUrl}/dashboard.html`);
console.log(`Provisioning (PC): ${baseUrl}/provisioning.html`);
for (const address of lanAddresses()) console.log(`Provisioning (device): http://${address}:${config.server.port}/provisioning.html`);

if (process.argv.includes("--open-provisioning")) openBrowser(`${baseUrl}/provisioning.html`);

async function shutdown() {
  await server.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
