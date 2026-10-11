"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeCp1256 = exports.encodeCp1256 = exports.ConnectionType = exports.sendOverTransport = exports.sendOverStream = exports.StreamTransport = exports.sendOverLan = exports.LanTransport = exports.getBankNameByBin = exports.getBankNameByPan = exports.BANK_BINS = exports.parseKvList = exports.parseLine = exports.parseRequestFileFromPath = exports.parseRequestFile = exports.getTagValue = exports.getBankBin = exports.getBankName = exports.getSerialNumber = exports.getTime = exports.getDate = exports.getDateTime = exports.getRrn = exports.getAmount = exports.getTerminalId = exports.getPan = exports.getTraceId = exports.getResponseCode = exports.decodeResponse = exports.formatParsedResponse = exports.parseResponse = exports.fillMsgTags = exports.buildMessage = exports.PecPcposFileBridge = exports.sendTransaction = exports.PecPcpos = void 0;
var pcpos_1 = require("./pcpos");
Object.defineProperty(exports, "PecPcpos", { enumerable: true, get: function () { return pcpos_1.PecPcpos; } });
Object.defineProperty(exports, "sendTransaction", { enumerable: true, get: function () { return pcpos_1.sendTransaction; } });
var file_bridge_1 = require("./file-bridge");
Object.defineProperty(exports, "PecPcposFileBridge", { enumerable: true, get: function () { return file_bridge_1.PecPcposFileBridge; } });
var message_1 = require("./message");
Object.defineProperty(exports, "buildMessage", { enumerable: true, get: function () { return message_1.buildMessage; } });
Object.defineProperty(exports, "fillMsgTags", { enumerable: true, get: function () { return message_1.fillMsgTags; } });
var response_1 = require("./response");
Object.defineProperty(exports, "parseResponse", { enumerable: true, get: function () { return response_1.parseResponse; } });
Object.defineProperty(exports, "formatParsedResponse", { enumerable: true, get: function () { return response_1.formatParsedResponse; } });
Object.defineProperty(exports, "decodeResponse", { enumerable: true, get: function () { return response_1.decodeResponse; } });
Object.defineProperty(exports, "getResponseCode", { enumerable: true, get: function () { return response_1.getResponseCode; } });
Object.defineProperty(exports, "getTraceId", { enumerable: true, get: function () { return response_1.getTraceId; } });
Object.defineProperty(exports, "getPan", { enumerable: true, get: function () { return response_1.getPan; } });
Object.defineProperty(exports, "getTerminalId", { enumerable: true, get: function () { return response_1.getTerminalId; } });
Object.defineProperty(exports, "getAmount", { enumerable: true, get: function () { return response_1.getAmount; } });
Object.defineProperty(exports, "getRrn", { enumerable: true, get: function () { return response_1.getRrn; } });
Object.defineProperty(exports, "getDateTime", { enumerable: true, get: function () { return response_1.getDateTime; } });
Object.defineProperty(exports, "getDate", { enumerable: true, get: function () { return response_1.getDate; } });
Object.defineProperty(exports, "getTime", { enumerable: true, get: function () { return response_1.getTime; } });
Object.defineProperty(exports, "getSerialNumber", { enumerable: true, get: function () { return response_1.getSerialNumber; } });
Object.defineProperty(exports, "getBankName", { enumerable: true, get: function () { return response_1.getBankName; } });
Object.defineProperty(exports, "getBankBin", { enumerable: true, get: function () { return response_1.getBankBin; } });
Object.defineProperty(exports, "getTagValue", { enumerable: true, get: function () { return response_1.getTagValue; } });
var file_parser_1 = require("./file-parser");
Object.defineProperty(exports, "parseRequestFile", { enumerable: true, get: function () { return file_parser_1.parseRequestFile; } });
Object.defineProperty(exports, "parseRequestFileFromPath", { enumerable: true, get: function () { return file_parser_1.parseRequestFileFromPath; } });
Object.defineProperty(exports, "parseLine", { enumerable: true, get: function () { return file_parser_1.parseLine; } });
Object.defineProperty(exports, "parseKvList", { enumerable: true, get: function () { return file_parser_1.parseKvList; } });
var bins_1 = require("./bins");
Object.defineProperty(exports, "BANK_BINS", { enumerable: true, get: function () { return bins_1.BANK_BINS; } });
Object.defineProperty(exports, "getBankNameByPan", { enumerable: true, get: function () { return bins_1.getBankNameByPan; } });
Object.defineProperty(exports, "getBankNameByBin", { enumerable: true, get: function () { return bins_1.getBankNameByBin; } });
var lan_1 = require("./transports/lan");
Object.defineProperty(exports, "LanTransport", { enumerable: true, get: function () { return lan_1.LanTransport; } });
Object.defineProperty(exports, "sendOverLan", { enumerable: true, get: function () { return lan_1.sendOverLan; } });
var stream_1 = require("./transports/stream");
Object.defineProperty(exports, "StreamTransport", { enumerable: true, get: function () { return stream_1.StreamTransport; } });
Object.defineProperty(exports, "sendOverStream", { enumerable: true, get: function () { return stream_1.sendOverStream; } });
Object.defineProperty(exports, "sendOverTransport", { enumerable: true, get: function () { return stream_1.sendOverTransport; } });
var types_1 = require("./types");
Object.defineProperty(exports, "ConnectionType", { enumerable: true, get: function () { return types_1.ConnectionType; } });
var encoding_1 = require("./encoding");
Object.defineProperty(exports, "encodeCp1256", { enumerable: true, get: function () { return encoding_1.encodeCp1256; } });
Object.defineProperty(exports, "decodeCp1256", { enumerable: true, get: function () { return encoding_1.decodeCp1256; } });
//# sourceMappingURL=index.js.map