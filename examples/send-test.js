/**
 * One-shot test client — sends a single transaction to a PEC POS at
 * the given IP:PORT and prints the parsed response.
 *
 * Usage:
 *   node examples/send-test.js 127.0.0.1 7020
 *
 * Requires the package to be built (`npm run build`).
 */
"use strict";
const { sendTransaction } = require("../dist/cjs");

async function main() {
  const ip = process.argv[2] || "127.0.0.1";
  const port = parseInt(process.argv[3] || "7020", 10);

  console.log(`[test-client] sending transaction to ${ip}:${port}...`);
  const resp = await sendTransaction({
    amount: "10000",
    type: "LAN",
    ip,
    port,
    prCode: "000000",
    currency: "364",
    timeoutMs: 5000,
  });

  console.log("[test-client] response:");
  console.log(`  responseCode:  ${resp.responseCode}`);
  console.log(`  traceId:       ${resp.traceId}`);
  console.log(`  pan:           ${resp.pan}`);
  console.log(`  terminalId:    ${resp.terminalId}`);
  console.log(`  amount:        ${resp.amount}`);
  console.log(`  rrn:           ${resp.rrn}`);
  console.log(`  dateTime:      ${resp.dateTime}`);
  console.log(`  date:          ${resp.date}`);
  console.log(`  time:          ${resp.time}`);
  console.log(`  serialNumber:  ${resp.serialNumber}`);
  console.log(`  bankName:      ${resp.bankName}`);
}

main().catch((err) => {
  console.error("[test-client] error:", err);
  process.exit(1);
});
