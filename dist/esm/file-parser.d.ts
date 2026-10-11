/**
 * Request-file parser.
 *
 * Faithful port of the request-file-parsing logic in the original
 * `Pec_PCPOS_WindowsService.PecPcposService` class (specifically the
 * `OnTimer` lambda + `ParseFileContent` / `ParseAmount` / `ParseType` /
 * `ParseConnectionParameter` / `ParseAdditionalParameters` methods).
 *
 * Request file format (UTF-8 text, one KEY=VALUE per line):
 *
 *   AMOUNT=1000
 *   TYPE=LAN
 *   IP=192.168.10.20
 *   PORT=7020
 *   PRCODE=000000
 *   CURRENCY=364
 *   CARDHOLDERRECEIPT=...
 *   CARDHOLDERTITLE=...
 *   MERCHANTRECEIPT=...
 *   MERCHANTTITLE=...
 *   SERVICE=...
 *   SERVICEGROUP=...
 *   SETTELMENT=AC=1111,AM=2222,AC=3333,AM=4444
 *   KEYVALUE=KY=foo,VL=bar
 *   COMPORT=COM3   # required when TYPE=SERIAL
 *
 * Notes:
 *   - Keys are case-insensitive (the original upper-cases both key and
 *     value via `.Trim().ToUpper()`).
 *   - Lines that don't contain `=` are silently dropped (Split returns
 *     <2 elements → ToDictionary skips them via the b__18_2 selector).
 *   - `SETTELMENT` and `KEYVALUE` values use `,` as the field separator
 *     (the original replaces `\r\n` with `\n`, then splits by `\n`).
 *     Each sub-line is parsed as `key=value`.
 *   - The original requires `AMOUNT` (must parse as UInt64), `TYPE`
 *     (must be LAN or SERIAL), and the connection params (`IP`+`PORT`
 *     for LAN, `COMPORT` for SERIAL). Everything else is optional.
 */
import type { PcposRequestOptions } from "./types";
import { ConnectionType } from "./types";
/**
 * Parse a single KEY=VALUE line.
 *
 * Mirrors the original `OnTimer` lambda `<OnTimer>b__18_0`:
 *   line.Split('=', 2, StringSplitOptions) → string[2]
 *
 * Returns `[key, value]` or `null` if the line doesn't contain `=`.
 */
export declare function parseLine(line: string): [string, string] | null;
/**
 * Parse the `SETTELMENT` (or `KEYVALUE`) value into an array of
 * `{key, value}` pairs.
 *
 * Mirrors the original `ParseAdditionalParameters` behaviour for the
 * SETTELMENT/KEYVALUE keys:
 *   value = value.replace("\r\n", "\n")
 *   for line in value.split("\n"):
 *     parts = line.split("=")
 *     if parts.Length != 2: skip
 *     ...
 *
 * We mirror the `,` → `\n` substitution done by the file-bridge layer
 * (the original replaces `,` with `\r\n` when storing the field on the
 * PCPOS object, but the BuildMsg method reverses that — so by the time
 * we get to parsing a raw file, the separator is whatever the file
 * contains). To support both `,`-separated and `\n`-separated values,
 * we accept either.
 *
 * @param raw the raw value string from the file
 * @returns array of `{key, value}` pairs (NOT uppercased — preserving
 *          the original casing of account numbers etc. The original
 *          does NOT ToUpper() these sub-values, only the top-level
 *          dict keys/values are uppercased.)
 */
export declare function parseKvList(raw: string): Array<{
    key: string;
    value: string;
}>;
/**
 * Parse the contents of a PEC PCPOS request file (UTF-8 text) into a
 * `PcposRequestOptions` object.
 *
 * @param fileContents the full text of the request file (any line
 *                     endings — `\r\n`, `\n`, or mixed)
 * @returns the parsed options
 * @throws Error if `AMOUNT` is missing or not a valid unsigned integer
 * @throws Error if `TYPE` is missing or not `LAN` / `SERIAL`
 * @throws Error if `TYPE=LAN` and `IP` is missing
 * @throws Error if `TYPE=LAN` and `PORT` is missing or not 1..65535
 * @throws Error if `TYPE=SERIAL` and `COMPORT` is missing
 *
 * Error messages match the original .NET exception strings exactly
 * (useful for compatibility — some downstream code may string-match
 * on these messages).
 */
export declare function parseRequestFile(fileContents: string): PcposRequestOptions;
/**
 * Convenience: parse a request file from disk.
 *
 * @param filePath absolute path to the request file
 * @returns the parsed options
 */
export declare function parseRequestFileFromPath(filePath: string): Promise<PcposRequestOptions>;
export { ConnectionType };
