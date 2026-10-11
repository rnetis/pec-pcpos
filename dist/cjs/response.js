"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResponseCode = getResponseCode;
exports.getTagValue = getTagValue;
exports.getTraceId = getTraceId;
exports.getPan = getPan;
exports.getTerminalId = getTerminalId;
exports.getAmount = getAmount;
exports.getRrn = getRrn;
exports.getDateTime = getDateTime;
exports.getSerialNumber = getSerialNumber;
exports.getDate = getDate;
exports.getTime = getTime;
exports.getBankName = getBankName;
exports.getBankBin = getBankBin;
exports.parseResponse = parseResponse;
exports.formatParsedResponse = formatParsedResponse;
exports.decodeResponse = decodeResponse;
/**
 * PEC PCPOS response-message parser.
 *
 * Faithful port of `Intek.PcPosLibrary.Response` (all `GetXXX()` methods)
 * from the original .NET assembly.
 *
 * The response wire format is the same shape as the request:
 *
 *   [ 4-digit ASCII decimal length prefix ]
 *   [ "RQ" + 3-digit ASCII decimal body length ]
 *   [ tag-block ]
 *
 * Within the tag-block, each tag is:
 *   [ 2-char key ][ 3-digit decimal length ][ value bytes ]
 *
 * The first tag in the response is always `RC` (response code), which is
 * always 2 chars (e.g. `"00"` for success). The parser hard-codes the
 * assumption that the response code lives at byte offset 14:
 *
 *   offset 0..3  : "0XXX"   (4-digit length)
 *   offset 4..5  : "RQ"     (request-header marker)
 *   offset 6..8  : "YYY"    (3-digit body length)
 *   offset 9..10 : "RC"     (response-code tag)
 *   offset 11..13: "002"    (response-code length, always 2)
 *   offset 14..15: <2-char response code>
 *
 * Subsequent tags (TR, PN, TM, AM, RN, TI, SR) are located by string
 * search — `IndexOf(tag)` returns the position of the 2-char key, then
 * the next 3 chars are the length, then the next N chars are the value.
 */
const encoding_1 = require("./encoding");
const bins_1 = require("./bins");
/**
 * .NET-style `Substring(startIndex, length)` shim.
 *
 * JS's `String.prototype.substring(start, end)` takes the END index, but
 * .NET's `String.Substring(startIndex, length)` takes the LENGTH. To keep
 * the parser a faithful byte-for-byte port, we go through this helper
 * instead of using JS substring directly.
 *
 * If `length` is omitted, behaves like .NET's single-arg `Substring(startIndex)`
 * — returns the tail of the string starting at `startIndex`.
 */
function sub(s, start, length) {
    if (length === undefined) {
        return s.slice(start);
    }
    return s.slice(start, start + length);
}
/**
 * Faithful port of `Response.GetTrxnResp()` — returns the 2-char
 * response code from byte offset 14 of the raw response.
 *
 * The returned string is the bare 2 chars (e.g. `"00"`, `"51"`) — it does
 * NOT include the `"ResponseCode = "` label prefix that the original C#
 * method adds. We expose both behaviours: this function returns the bare
 * value; `formatParsedResponse()` returns the labelled multi-line form.
 */
function getResponseCode(rawResponse) {
    if (!rawResponse || rawResponse.length < 16)
        return "";
    return sub(rawResponse, 14, 2);
}
/**
 * Faithful port of the generic tag-value extractor used by
 * `GetTraceNo`, `GetPANID`, `GetTerminalID`, `GetAmount`, `GetTrxnRRN`,
 * `GetTrxnDateTime`, `GetTrxnSerial`.
 *
 * All of these methods in the original C# share an identical pattern:
 *
 *   if (rawResponse.IndexOf(tag) > 0)
 *     result = rawResponse.Substring(
 *       rawResponse.IndexOf(tag) + 5,
 *       Convert.ToInt32(rawResponse.Substring(
 *         rawResponse.IndexOf(tag) + 2,
 *         3)));
 *   return result;
 *
 * I.e.:
 *   1. Find the position of the 2-char tag.
 *   2. The 3 chars starting at position+2 are the decimal length.
 *   3. The value starts at position+5 and is `length` chars long.
 *
 * NOTE: the original uses `> 0`, not `>= 0`. This means if the tag appears
 * at offset 0 (which would be inside the 4-digit length prefix), it's
 * skipped. In practice the tag can never be at offset 0 because offset 0
 * holds the first ASCII digit of the length prefix.
 *
 * @param rawResponse the full raw response string (post-cp1256 decode)
 * @param tag the 2-char tag key to look up (e.g. `"TR"`, `"PN"`, `"TM"`)
 * @returns the tag's value, or `""` if the tag isn't present
 */
function getTagValue(rawResponse, tag) {
    if (!rawResponse || tag.length !== 2)
        return "";
    const idx = rawResponse.indexOf(tag);
    if (idx <= 0)
        return "";
    // Bounds-check before reading the 3-char length field.
    if (idx + 5 > rawResponse.length)
        return "";
    const lenStr = sub(rawResponse, idx + 2, 3);
    let len;
    // parseInt never throws — returns NaN on bad input. We check for NaN.
    len = parseInt(lenStr, 10);
    if (!Number.isFinite(len) || len < 0)
        return "";
    const valueStart = idx + 5;
    if (valueStart + len > rawResponse.length) {
        // Truncated response — return whatever we have. (Original C# would
        // throw; we're more forgiving so callers can still salvage what's
        // there in a partial-response scenario.)
        return sub(rawResponse, valueStart);
    }
    return sub(rawResponse, valueStart, len);
}
/**
 * Faithful port of `Response.GetTraceNo()` — but without the
 * `"TraceID = "` label prefix. Returns just the bare trace value.
 */
function getTraceId(rawResponse) {
    return getTagValue(rawResponse, "TR");
}
/** Port of `Response.GetPANID()` without the label prefix. */
function getPan(rawResponse) {
    return getTagValue(rawResponse, "PN");
}
/** Port of `Response.GetTerminalID()` without the label prefix. */
function getTerminalId(rawResponse) {
    return getTagValue(rawResponse, "TM");
}
/** Port of `Response.GetAmount()` without the label prefix. */
function getAmount(rawResponse) {
    return getTagValue(rawResponse, "AM");
}
/** Port of `Response.GetTrxnRRN()` without the label prefix. */
function getRrn(rawResponse) {
    return getTagValue(rawResponse, "RN");
}
/** Port of `Response.GetTrxnDateTime()` without the label prefix. */
function getDateTime(rawResponse) {
    return getTagValue(rawResponse, "TI");
}
/** Port of `Response.GetTrxnSerial()` without the label prefix. */
function getSerialNumber(rawResponse) {
    return getTagValue(rawResponse, "SR");
}
/**
 * Faithful port of `Response.GetTrxnDate()` (without the label prefix).
 *
 * Returns the 10-char date portion of the `TI` tag value, which is the
 * Persian (Jalali) calendar date in `YYYY/MM/DD` form.
 *
 * The original C#:
 *   rawResponse.Substring(rawResponse.IndexOf("TI") + 5, 10)
 *
 * I.e. skip `"TI"` (2) + 3-digit length (3) = 5 chars, then take 10 chars.
 */
function getDate(rawResponse) {
    if (!rawResponse)
        return "";
    const idx = rawResponse.indexOf("TI");
    if (idx <= 0)
        return "";
    if (idx + 5 + 10 > rawResponse.length)
        return "";
    return sub(rawResponse, idx + 5, 10);
}
/**
 * Faithful port of `Response.GetTrxnTime()` (without the label prefix).
 *
 * Returns the 8-char time portion of the `TI` tag value, which follows
 * the 10-char date and a 1-char separator (typically a space).
 *
 * The original C#:
 *   rawResponse.Substring(rawResponse.IndexOf("TI") + 5 + 10 + 1, 8)
 */
function getTime(rawResponse) {
    if (!rawResponse)
        return "";
    const idx = rawResponse.indexOf("TI");
    if (idx <= 0)
        return "";
    const start = idx + 5 + 10 + 1;
    if (start + 8 > rawResponse.length)
        return "";
    return sub(rawResponse, start, 8);
}
/**
 * Faithful port of `Response.GetBankName()` — looks up the bank name
 * from the PAN's first 6 digits (the BIN prefix).
 *
 * Note: the original C# also has a guard `if (rawResponse.IndexOf("PN") > 0)`.
 * We preserve that here by extracting the PAN first.
 */
function getBankName(rawResponse) {
    if (!rawResponse)
        return "";
    const pan = getPan(rawResponse);
    if (!pan || pan.length < 6)
        return "";
    return (0, bins_1.getBankNameByPan)(pan);
}
/**
 * Faithful port of `Response.GetBankBin(respSuccess)`.
 *
 * Returns `"PAN = " + first6` of the PAN found in `respSuccess` (the
 * success-response string the caller passes in).
 *
 * Note: this is a different signature from the other `Get*` helpers —
 * it takes an explicit `respSuccess` argument rather than reading from
 * the stored `RawResponse`. We mirror that.
 */
function getBankBin(respSuccess) {
    if (!respSuccess)
        return "PAN = ";
    const idx = respSuccess.indexOf("PN");
    if (idx <= 0)
        return "PAN = ";
    if (idx + 5 + 6 > respSuccess.length)
        return "PAN = ";
    // Extract the length-prefixed value just like getTagValue, but here
    // we only need the first 6 chars.
    const lenStr = sub(respSuccess, idx + 2, 3);
    let len;
    len = parseInt(lenStr, 10);
    if (!Number.isFinite(len) || len < 6)
        return "PAN = ";
    const valueStart = idx + 5;
    const first6 = sub(respSuccess, valueStart, 6);
    return "PAN = " + first6;
}
/**
 * Parse a raw response string into a structured `PcposResponse` object.
 *
 * This is the JS equivalent of `Response.GetParsedResp()`, but returns
 * a proper object instead of a multi-line human-readable string. Use
 * `formatParsedResponse()` if you specifically want the original's
 * `"ResponseCode = 00\r\nTraceID = 123\r\n..."` text format.
 *
 * @param rawResponse the raw response string (already cp1256-decoded,
 *                    including the 4-digit length prefix)
 */
function parseResponse(rawResponse) {
    if (!rawResponse) {
        return {
            responseCode: "",
            traceId: "",
            pan: "",
            terminalId: "",
            amount: "",
            rrn: "",
            dateTime: "",
            date: "",
            time: "",
            serialNumber: "",
            bankName: "",
            rawResponse: "",
        };
    }
    return {
        responseCode: getResponseCode(rawResponse),
        traceId: getTraceId(rawResponse),
        pan: getPan(rawResponse),
        terminalId: getTerminalId(rawResponse),
        amount: getAmount(rawResponse),
        rrn: getRrn(rawResponse),
        dateTime: getDateTime(rawResponse),
        date: getDate(rawResponse),
        time: getTime(rawResponse),
        serialNumber: getSerialNumber(rawResponse),
        bankName: getBankName(rawResponse),
        rawResponse,
    };
}
/**
 * Faithful port of `Response.GetParsedResp()` — produces the multi-line
 * human-readable response string used by the original Windows Service
 * when writing the response file.
 *
 * Output format:
 *   "ResponseCode = 00\r\nTraceID = 123\r\nPAN = 621986...1234\r\n..."
 */
function formatParsedResponse(rawResponse) {
    if (!rawResponse)
        return "";
    const lines = [
        `ResponseCode = ${getResponseCode(rawResponse)}`,
        `TraceID = ${getTraceId(rawResponse)}`,
        `PAN = ${getPan(rawResponse)}`,
        `TerminalID = ${getTerminalId(rawResponse)}`,
        `Amount = ${getAmount(rawResponse)}`,
        `RRN = ${getRrn(rawResponse)}`,
        `DateTime = ${getDateTime(rawResponse)}`,
        `Date = ${getDate(rawResponse)}`,
        `Time = ${getTime(rawResponse)}`,
        `SerialNumber = ${getSerialNumber(rawResponse)}`,
    ];
    return lines.join("\r\n");
}
/**
 * Decode a raw response Buffer (bytes received from the wire) into the
 * structured `PcposResponse` object.
 *
 * This is the high-level helper most callers will use after
 * `Pcpos.sendTransaction()` resolves. It handles cp1256 decoding and
 * then runs `parseResponse()` on the result.
 *
 * @param bytes the raw bytes received from the POS
 * @param start optional start offset (default 0)
 * @param end optional end offset (default bytes.length)
 */
function decodeResponse(bytes, start = 0, end = bytes.length) {
    const rawResponse = (0, encoding_1.decodeCp1256)(bytes, start, end);
    return parseResponse(rawResponse);
}
//# sourceMappingURL=response.js.map