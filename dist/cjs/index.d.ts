/**
 * pec-pcpos — Pure-Node.js reimplementation of the Intek.PcPosLibrary
 * protocol library + PEC PCPOS Windows Service file-bridge.
 *
 * Reverse-engineered from `Pec-PCPOS-WindowsService.exe` (.NET 4.5.2,
 * Copyright © 2017).
 *
 * ## Quick start
 *
 * ### One-shot transaction over LAN
 *
 * ```ts
 * import { sendTransaction } from "pec-pcpos";
 *
 * const resp = await sendTransaction({
 *   amount: "10000",
 *   type: "LAN",
 *   ip: "192.168.10.20",
 *   port: 7020,
 * });
 * console.log(resp.responseCode, resp.rrn, resp.bankName);
 * ```
 *
 * ### Long-lived client (LAN or serial)
 *
 * ```ts
 * import { PecPcpos, LanTransport, StreamTransport } from "pec-pcpos";
 *
 * // LAN
 * const pcpos = new PecPcpos({ ip: "192.168.10.20", port: 7020 });
 * pcpos.on("connect", () => console.log("connected"));
 * const resp = await pcpos.sendTransaction({ amount: "1000", type: "LAN" });
 *
 * // Serial
 * import { SerialPort } from "serialport";
 * const port = new SerialPort({ path: "COM3", baudRate: 19200, autoOpen: false });
 * await port.open();
 * const pcposS = new PecPcpos({ transport: new StreamTransport(port) });
 * const resp2 = await pcposS.sendTransaction({ amount: "1000", type: "SERIAL" });
 * ```
 *
 * ### Drop-in Windows-Service replacement
 *
 * ```ts
 * import { PecPcposFileBridge } from "pec-pcpos";
 *
 * const bridge = new PecPcposFileBridge({
 *   basePath: "/var/lib/pec-pcpos",   // or "C:\\Users\\Public\\PEC_PCPOS"
 *   pcpos: { ip: "192.168.10.20", port: 7020 },
 * });
 * bridge.on("response", (file, resp) => console.log(file, resp.responseCode));
 * bridge.start();
 * ```
 *
 * ## Layout
 *
 * - `PecPcpos`              — high-level client (Promise + EventEmitter)
 * - `sendTransaction()`      — one-shot helper
 * - `PecPcposFileBridge`   — directory-watcher service (drop-in replacement)
 * - `buildMessage()`        — low-level message builder
 * - `parseResponse()`       — low-level response parser
 * - `parseRequestFile()`    — parse a `KEY=VALUE` request file
 * - `getBankNameByPan()`    — Iranian bank BIN lookup
 * - `LanTransport`          — pluggable LAN (TCP) transport
 * - `StreamTransport`       — pluggable duplex-stream transport (for serial)
 * - `ConnectionType`        — enum (LAN=0, SERIAL=1)
 */
export { PecPcpos, sendTransaction } from "./pcpos";
export type { PecPcposOptions } from "./pcpos";
export { PecPcposFileBridge } from "./file-bridge";
export type { FileBridgeOptions } from "./file-bridge";
export { buildMessage, fillMsgTags, } from "./message";
export { parseResponse, formatParsedResponse, decodeResponse, getResponseCode, getTraceId, getPan, getTerminalId, getAmount, getRrn, getDateTime, getDate, getTime, getSerialNumber, getBankName, getBankBin, getTagValue, } from "./response";
export { parseRequestFile, parseRequestFileFromPath, parseLine, parseKvList, } from "./file-parser";
export { BANK_BINS, getBankNameByPan, getBankNameByBin, } from "./bins";
export { LanTransport, sendOverLan } from "./transports/lan";
export { StreamTransport, sendOverStream, sendOverTransport, } from "./transports/stream";
export type { DuplexStreamLike } from "./transports/stream";
export { ConnectionType } from "./types";
export type { PcposRequestOptions, PcposResponse, BuildMsgResult, MsgTags, DuplexTransport, } from "./types";
export { encodeCp1256, decodeCp1256 } from "./encoding";
