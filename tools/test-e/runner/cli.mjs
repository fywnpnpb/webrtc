import { loadTestEConfig } from "../config/load-config.mjs";
import { scenarios, TestERunner } from "./IVRAutoTestE.mjs";
import { RunReporter } from "./reporter.mjs";

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name) => args.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
const config = loadTestEConfig();

console.log(`Test API: ${process.env.IVR_E_WEB_API_BASE || `http://127.0.0.1:${config.server.port}`}`);
console.log(`Devices: A=${config.devices.A.deviceId}/${config.devices.A.authUser} B=${config.devices.B.deviceId}/${config.devices.B.authUser} C=${config.devices.C.deviceId}/${config.devices.C.authUser}`);
console.log(`Scenarios: inbound=${scenarios.filter((scenario) => scenario.direction === "inbound").length} outbound=${scenarios.filter((scenario) => scenario.direction === "outbound").length} total=${scenarios.length}`);

let targets = scenarios;
if (has("--inbound")) targets = targets.filter((scenario) => scenario.direction === "inbound");
if (has("--outbound")) targets = targets.filter((scenario) => scenario.direction === "outbound");
if (value("--case")) targets = targets.filter((scenario) => scenario.id === value("--case"));

if (has("--list")) {
  for (const scenario of targets) console.log(`- ${scenario.id}: ${scenario.direction} / ${scenario.label}`);
  process.exit(0);
}

const reporter = new RunReporter();
const runner = new TestERunner({
  config,
  manualExternal: has("--manual-external"),
  keepRegistered: has("--keep-registered") || has("--smoke"),
  reporter,
});

let finalSummary = { mode: has("--smoke") ? "smoke" : "test:e", status: "failed", results: [] };
try {
  if (has("--smoke")) {
    const results = await runner.runSmoke();
    const status = results.some((result) => !result.ok && !result.blocked)
      ? "failed"
      : results.some((result) => result.blocked)
        ? "blocked"
        : "completed";
    finalSummary = { mode: "smoke", status, results };
    if (results.some((result) => !result.ok && !result.blocked)) process.exitCode = 1;
  } else {
    if (!targets.length) throw new Error(`No scenario matched: ${value("--case") || "(empty)"}`);
    if (has("--reset-events")) await runner.api.post("/events/reset");
    if (has("--reset-commands")) await runner.api.post("/commands/reset");
    const results = await runner.runAll(targets);
    finalSummary = { mode: "test:e", status: results.some((result) => !result.ok) ? "failed" : "completed", results };
    if (results.some((result) => !result.ok)) process.exitCode = 1;
  }
} catch (error) {
  finalSummary = { ...finalSummary, status: "failed", error: error.message };
  console.error(`Test E に失敗しました: ${error.message}`);
  console.error("サービスを起動してください: npm run start:test-api");
  process.exitCode = 1;
} finally {
  const outputDir = await reporter.finalize(runner.api, finalSummary);
  console.log(`テスト結果: ${outputDir}`);
}
