/**
 * Mock POS TCP server — simulates a PEC POS terminal for testing.
 *
 * Listens on a TCP port. When a client connects and sends a request,
 * parses the request, prints it, and responds with a synthetic response
 * containing a fixed PAN from a known Iranian bank BIN (so the bank-name
 * lookup can be exercised end-to-end).
 *
 * Usage:
 *   node examples/mock-server.js 7020
 *
 * Requires the package to be built (`npm run build`).
 */
"use strict";
const net = require("net");
const {
  decodeCp1256,
  decodeResponse,
  encodeCp1256,
} = require("../dist/cjs");

const PORT = parseInt(process.argv[2] || "7020", 10);

/**
 * Build a synthetic response in the same wire format the real POS would send:
 *   [ 4-digit ASCII length prefix ]
 *   [ "RQ" + 3-digit body length ]
 *   [ RC + 3-digit length + 2-char response code ]
 *   [ ...additional tags... ]
 */
function buildResponse(opts) {
  const tags = [];
  if (opts.traceId) tags.push(["TR", opts.traceId]);
  if (opts.pan) tags.push(["PN", opts.pan]);
  if (opts.terminalId) tags.push(["TM", opts.terminalId]);
  if (opts.amount) tags.push(["AM", opts.amount]);
  if (opts.rrn) tags.push(["RN", opts.rrn]);
  if (opts.dateTime) tags.push(["TI", opts.dateTime]);
  if (opts.serial) tags.push(["SR", opts.serial]);

  let body = "";
  body +=
    "RC" + String(opts.responseCode.length).padStart(3, "0") + opts.responseCode;
  for (const [k, v] of tags) {
    body += k + String(v.length).padStart(3, "0") + v;
  }
  const bodyWithRq =
    "RQ" + String(body.length).padStart(3, "0") + body;
  const prefixed =
    String(bodyWithRq.length).padStart(4, "0") + bodyWithRq;
  return encodeCp1256(prefixed);
}

const server = net.createServer((socket) => {
  console.log(
    `[mock-POS] client connected from ${socket.remoteAddress}:${socket.remotePort}`,
  );

  socket.on("data", (data) => {
    const lenStr = data.subarray(0, 4).toString("ascii");
    const len = parseInt(lenStr, 10);
    if (!Number.isFinite(len)) {
      console.error(
        `[mock-POS] invalid length prefix: ${JSON.stringify(lenStr)}`,
      );
      socket.destroy();
      return;
    }
    const body = decodeCp1256(data, 4, 4 + len);
    console.log(`[mock-POS] received ${data.length} bytes:`);
    console.log(`           body: ${JSON.stringify(body)}`);

    const response = buildResponse({
      responseCode: "00",
      traceId: "123456",
      pan: "6219860012345678", // Bank Saman BIN
      terminalId: "01234567",
      amount: "1000000",
      rrn: "202401010000001",
      // .NET expects: date (10 chars) + sep (1 char) + time (8 chars) = 19 chars
      dateTime: "1403/01/01 12:30:45",
      serial: "0001",
    });
    console.log(`[mock-POS] sending ${response.length} bytes back`);
    socket.write(response);

    // Verify the response decodes correctly using our own library.
    const parsed = decodeResponse(response);
    console.log(
      `[mock-POS] self-check: responseCode=${parsed.responseCode} pan=${parsed.pan} bank=${parsed.bankName}`,
    );
  });

  socket.on("end", () => console.log("[mock-POS] client disconnected"));
  socket.on("error", (err) =>
    console.error("[mock-POS] socket error:", err.message),
  );
});

server.listen(PORT, () => {
  console.log(`[mock-POS] listening on port ${PORT}`);
  console.log(
    `[mock-POS] test with: node examples/send-test.js localhost ${PORT}`,
  );
});
