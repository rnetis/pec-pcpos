import { ConnectionType } from "./types";
/**
 * Parse a single KEY=VALUE line.
 *
 * Mirrors the original `OnTimer` lambda `<OnTimer>b__18_0`:
 *   line.Split('=', 2, StringSplitOptions) → string[2]
 *
 * Returns `[key, value]` or `null` if the line doesn't contain `=`.
 */
export function parseLine(line) {
    // .NET's Split(char[], 2, StringSplitOptions) splits at the FIRST
    // occurrence and returns 2 parts. We mirror that with indexOf.
    const idx = line.indexOf("=");
    if (idx < 0)
        return null;
    const key = line.substring(0, idx);
    const value = line.substring(idx + 1);
    return [key, value];
}
/**
 * Apply the original's `.Trim().ToUpper()` normalisation to a key or
 * value. Mirrors the `<OnTimer>b__18_1` / `b__18_2` lambdas.
 */
function trimUpper(s) {
    return s.trim().toUpperCase();
}
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
export function parseKvList(raw) {
    if (!raw)
        return [];
    // Normalize: \r\n → \n, then split by either \n or ,
    const normalized = raw.replace(/\r\n/g, "\n");
    const lines = normalized.split(/[,\n]/);
    const out = [];
    for (const line of lines) {
        const parsed = parseLine(line);
        if (!parsed)
            continue;
        // The original does NOT uppercase these sub-values. Preserves casing.
        out.push({ key: parsed[0].trim(), value: parsed[1].trim() });
    }
    return out;
}
/**
 * Convert a `SETTELMENT` kv-list (keys `AC`/`AM`) into the structured
 * `{account, amount}` array shape expected by `PcposRequestOptions`.
 *
 * The original emits one `ST` sub-block per AC/AM pair. If the file
 * contains orphan `AC` or `AM` entries (an odd number of pairs), we
 * silently skip the orphan.
 */
function kvListToSettlement(kvs) {
    const out = [];
    for (let i = 0; i + 1 < kvs.length; i += 2) {
        const a = kvs[i];
        const b = kvs[i + 1];
        if (a.key.toUpperCase() === "AC" && b.key.toUpperCase() === "AM") {
            out.push({ account: a.value, amount: b.value });
        }
        else {
            // Not the expected pattern — still preserve as best we can.
            out.push({ account: a.value, amount: b.value });
        }
    }
    return out;
}
/**
 * Convert a `KEYVALUE` kv-list into the `{key, value}` array shape
 * expected by `PcposRequestOptions`.
 */
function kvListToKeyValue(kvs) {
    return kvs.map((kv) => ({ key: kv.key, value: kv.value }));
}
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
export function parseRequestFile(fileContents) {
    const lines = fileContents.replace(/\r\n/g, "\n").split("\n");
    const dict = new Map();
    for (const line of lines) {
        const parsed = parseLine(line);
        if (!parsed)
            continue;
        const key = trimUpper(parsed[0]);
        const value = trimUpper(parsed[1]);
        dict.set(key, value);
    }
    const has = (k) => dict.has(k);
    const get = (k) => { var _a; return (_a = dict.get(k)) !== null && _a !== void 0 ? _a : ""; };
    // --- AMOUNT (required, must be UInt64-parseable) ---
    if (!has("AMOUNT")) {
        throw new Error("Amount must be specified. for example Amount=1000");
    }
    const amountStr = get("AMOUNT");
    // .NET's UInt64.TryParse accepts non-negative integers; we approximate.
    if (!/^\d+$/.test(amountStr)) {
        throw new Error("Amount has not valid value.");
    }
    const amount = amountStr;
    // --- TYPE (required, must be LAN or SERIAL) ---
    if (!has("TYPE")) {
        throw new Error("Type is not specified. Use LAN or SERIAL as type.\r\n for example type=LAN");
    }
    const typeStr = get("TYPE");
    let type;
    if (typeStr === "LAN") {
        type = "LAN";
    }
    else if (typeStr === "SERIAL") {
        type = "SERIAL";
    }
    else {
        throw new Error("Type is not valid. Use LAN or SERIAL only.\r\n for example type=LAN");
    }
    // --- Connection params ---
    let ip;
    let port;
    let comPort;
    if (type === "SERIAL") {
        if (!has("COMPORT")) {
            throw new Error("com port is not specified. Use SERIAL port number.\r\n for example comport=COM3");
        }
        comPort = get("COMPORT");
    }
    else {
        // LAN
        if (!has("IP")) {
            throw new Error("port is not specified. Use POS LAN Ip.\r\n for example ip=192.168.10.20");
        }
        ip = get("IP");
        if (!has("PORT")) {
            throw new Error("port is not specified. Use POS LAN port number.\r\n for example port=7020");
        }
        const portStr = get("PORT");
        // .NET's UInt16.TryParse accepts 0..65535.
        if (!/^\d+$/.test(portStr)) {
            throw new Error("Port has not valid value. a port number must be between 1 to 65535");
        }
        const portNum = parseInt(portStr, 10);
        if (portNum < 1 || portNum > 65535) {
            throw new Error("Port has not valid value. a port number must be between 1 to 65535");
        }
        port = portNum;
    }
    // --- Optional additional parameters ---
    const opts = {
        amount,
        type,
        ip,
        port,
        comPort,
    };
    if (has("PRCODE"))
        opts.prCode = get("PRCODE");
    if (has("CURRENCY"))
        opts.currency = get("CURRENCY");
    if (has("CARDHOLDERRECEIPT"))
        opts.cardholderReceipt = get("CARDHOLDERRECEIPT");
    if (has("CARDHOLDERTITLE"))
        opts.cardholderTitle = get("CARDHOLDERTITLE");
    if (has("MERCHANTRECEIPT"))
        opts.merchantReceipt = get("MERCHANTRECEIPT");
    if (has("MERCHANTTITLE"))
        opts.merchantTitle = get("MERCHANTTITLE");
    if (has("SERVICE"))
        opts.service = get("SERVICE");
    if (has("SERVICEGROUP"))
        opts.serviceGroup = get("SERVICEGROUP");
    // SETTELMENT (note: original typo preserved)
    if (has("SETTELMENT")) {
        const kvs = parseKvList(get("SETTELMENT"));
        opts.settlement = kvListToSettlement(kvs);
    }
    // KEYVALUE
    if (has("KEYVALUE")) {
        const kvs = parseKvList(get("KEYVALUE"));
        opts.keyValue = kvListToKeyValue(kvs);
    }
    return opts;
}
/**
 * Convenience: parse a request file from disk.
 *
 * @param filePath absolute path to the request file
 * @returns the parsed options
 */
export async function parseRequestFileFromPath(filePath) {
    const fs = await import("fs/promises");
    const contents = await fs.readFile(filePath, "utf8");
    return parseRequestFile(contents);
}
// Avoids "unused" lint warning for the enum import (re-exported for callers
// who want to import everything from this one module).
export { ConnectionType };
//# sourceMappingURL=file-parser.js.map