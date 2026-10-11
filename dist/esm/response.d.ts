import type { PcposResponse } from "./types";
/**
 * Faithful port of `Response.GetTrxnResp()` — returns the 2-char
 * response code from byte offset 14 of the raw response.
 *
 * The returned string is the bare 2 chars (e.g. `"00"`, `"51"`) — it does
 * NOT include the `"ResponseCode = "` label prefix that the original C#
 * method adds. We expose both behaviours: this function returns the bare
 * value; `formatParsedResponse()` returns the labelled multi-line form.
 */
export declare function getResponseCode(rawResponse: string): string;
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
export declare function getTagValue(rawResponse: string, tag: string): string;
/**
 * Faithful port of `Response.GetTraceNo()` — but without the
 * `"TraceID = "` label prefix. Returns just the bare trace value.
 */
export declare function getTraceId(rawResponse: string): string;
/** Port of `Response.GetPANID()` without the label prefix. */
export declare function getPan(rawResponse: string): string;
/** Port of `Response.GetTerminalID()` without the label prefix. */
export declare function getTerminalId(rawResponse: string): string;
/** Port of `Response.GetAmount()` without the label prefix. */
export declare function getAmount(rawResponse: string): string;
/** Port of `Response.GetTrxnRRN()` without the label prefix. */
export declare function getRrn(rawResponse: string): string;
/** Port of `Response.GetTrxnDateTime()` without the label prefix. */
export declare function getDateTime(rawResponse: string): string;
/** Port of `Response.GetTrxnSerial()` without the label prefix. */
export declare function getSerialNumber(rawResponse: string): string;
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
export declare function getDate(rawResponse: string): string;
/**
 * Faithful port of `Response.GetTrxnTime()` (without the label prefix).
 *
 * Returns the 8-char time portion of the `TI` tag value, which follows
 * the 10-char date and a 1-char separator (typically a space).
 *
 * The original C#:
 *   rawResponse.Substring(rawResponse.IndexOf("TI") + 5 + 10 + 1, 8)
 */
export declare function getTime(rawResponse: string): string;
/**
 * Faithful port of `Response.GetBankName()` — looks up the bank name
 * from the PAN's first 6 digits (the BIN prefix).
 *
 * Note: the original C# also has a guard `if (rawResponse.IndexOf("PN") > 0)`.
 * We preserve that here by extracting the PAN first.
 */
export declare function getBankName(rawResponse: string): string;
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
export declare function getBankBin(respSuccess: string): string;
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
export declare function parseResponse(rawResponse: string): PcposResponse;
/**
 * Faithful port of `Response.GetParsedResp()` — produces the multi-line
 * human-readable response string used by the original Windows Service
 * when writing the response file.
 *
 * Output format:
 *   "ResponseCode = 00\r\nTraceID = 123\r\nPAN = 621986...1234\r\n..."
 */
export declare function formatParsedResponse(rawResponse: string): string;
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
export declare function decodeResponse(bytes: Uint8Array | Buffer, start?: number, end?: number): PcposResponse;
