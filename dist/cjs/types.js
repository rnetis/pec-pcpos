"use strict";
/**
 * Shared types for the PEC PCPOS protocol library.
 *
 * Faithful port of `Intek.PcPosLibrary.PCPOS` (and friends) from the
 * original `Pec-PCPOS-WindowsService.exe` .NET assembly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MSG_TAG_ORDER = exports.ConnectionType = void 0;
/**
 * Transport connection type. Mirrors `Intek.PcPosLibrary.PCPOS/cnType`.
 *
 * - `LAN`    (value 0) — Talk to the POS over TCP/IP using `Ip:Port`.
 * - `SERIAL` (value 1) — Talk to the POS over a 19200/8/N/1 COM port.
 *
 * The wire-protocol is identical regardless of transport; only the byte
 * stream differs.
 */
var ConnectionType;
(function (ConnectionType) {
    ConnectionType[ConnectionType["LAN"] = 0] = "LAN";
    ConnectionType[ConnectionType["SERIAL"] = 1] = "SERIAL";
})(ConnectionType || (exports.ConnectionType = ConnectionType = {}));
/** Tag-key order used by `fillMsgParams` in the original .NET library. */
exports.MSG_TAG_ORDER = [
    "PR",
    "AM",
    "CU",
    "R1",
    "R2",
    "T1",
    "T2",
    "SV",
    "SG",
    "AD",
    "PD",
];
//# sourceMappingURL=types.js.map