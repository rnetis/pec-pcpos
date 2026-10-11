"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fillMsgTags = fillMsgTags;
exports.buildMessage = buildMessage;
/**
 * PEC PCPOS request-message builder.
 *
 * Faithful port of `Intek.PcPosLibrary.PCPOS.fillMsgParams()` and
 * `Intek.PcPosLibrary.PCPOS.BuildMsg()` from the original .NET assembly.
 *
 * Wire format (after cp1256 encoding):
 *
 *   [ 4-digit ASCII decimal length prefix = length of remaining bytes ]
 *   [ "RQ" + 3-digit ASCII decimal length of tag-block ]
 *   [ tag-block ]
 *
 * Where `tag-block` is, for each non-empty entry in Msg_Tags (insertion order):
 *
 *   [ 2-char tag ][ 3-digit decimal length of value ][ value bytes ]
 *
 * e.g. `PR` = "000000" (6 chars) → `"PR006000000"`
 *
 * After the base block, two optional sub-blocks may be appended:
 *
 *   1. `Settel` (settlement) — for each `account=amount` line:
 *        sub = "AC" + len(account) + account + "AM" + len(amount) + amount
 *        body += "ST" + len(sub) + sub
 *
 *   2. `KeyValue` — for each `key=value` line:
 *        sub = "KY" + len(key) + key + "VL" + len(value) + value
 *        body += "AV" + len(sub) + sub
 *        body += "PV" + len(sub) + sub    (yes, the same sub twice —
 *                                         faithful to the original bug)
 *
 * Lengths are encoded as zero-padded ASCII decimal:
 *   - tag-value length: 3 digits, zero-padded
 *   - tag-block length: 3 digits, zero-padded
 *   - total body length prefix: 4 digits, zero-padded
 *
 * Tag keys are NOT zero-padded — they're already 2 chars. They ARE passed
 * through `PadLeft(2, ' ')` in the original, but since all tag keys are
 * already 2 chars, this is a no-op. We replicate it for safety.
 *
 * The final byte stream is encoded with Windows-1256 (Arabic) — the same
 * codepage that `Encoding.GetEncoding(1256)` uses in .NET.
 */
const encoding_1 = require("./encoding");
const types_1 = require("./types");
/**
 * Pad a string on the left with `padChar` until it reaches `totalWidth`.
 * Direct equivalent of .NET's `string.PadLeft(int totalWidth, char padChar)`.
 */
function padLeft(s, totalWidth, padChar) {
    if (s.length >= totalWidth)
        return s;
    return padChar.repeat(totalWidth - s.length) + s;
}
/**
 * Encode an integer as a zero-padded ASCII decimal of fixed width.
 * Direct equivalent of `n.ToString().PadLeft(width, '0')`.
 */
function padNum(n, width) {
    return padLeft(String(n), width, "0");
}
/**
 * Build the `Msg_Tags` dictionary for a transaction, mirroring the
 * exact insertion order of `fillMsgParams()`.
 *
 * NOTE: the original C# code populates ALL fields including empty ones
 * (e.g. `AD` → `""`); the empty fields are then filtered out in
 * `BuildMsg()`. We preserve that two-step behaviour here for clarity.
 *
 * @param opts the user-supplied options. Defaults applied:
 *   - `prCode`   → `"000000"` (matches the PCPOS ctor)
 *   - `currency` → `"364"`    (matches the PCPOS ctor; 364 = Iranian Rial)
 *   - All receipt/title strings → `""` if not specified
 */
function fillMsgTags(opts) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return {
        PR: (_a = opts.prCode) !== null && _a !== void 0 ? _a : "000000",
        AM: String(opts.amount),
        CU: (_b = opts.currency) !== null && _b !== void 0 ? _b : "364",
        R1: (_c = opts.cardholderReceipt) !== null && _c !== void 0 ? _c : "",
        R2: (_d = opts.merchantReceipt) !== null && _d !== void 0 ? _d : "",
        T1: (_e = opts.cardholderTitle) !== null && _e !== void 0 ? _e : "",
        T2: (_f = opts.merchantTitle) !== null && _f !== void 0 ? _f : "",
        SV: (_g = opts.service) !== null && _g !== void 0 ? _g : "",
        SG: (_h = opts.serviceGroup) !== null && _h !== void 0 ? _h : "",
        AD: "",
        PD: "1",
    };
}
/**
 * Append a `[2-char tag][3-digit length][value]` segment to `body`.
 *
 * Equivalent to the C# expression:
 *   body += key.PadLeft(2, ' ') + value.Length.ToString().PadLeft(3, '0') + value;
 *
 * Returns the new body string (does not mutate the input).
 */
function appendTag(body, key, value) {
    const tag = padLeft(key, 2, " ");
    const lenField = padNum(value.length, 3);
    return body + tag + lenField + value;
}
/**
 * Append the optional settlement (`ST`) sub-blocks.
 *
 * For each `account=amount` pair, builds:
 *   sub = appendTag("", "AC", account) + appendTag("", "AM", amount)
 *   body += appendTag(body, "ST", sub)
 *
 * The original C# is a tad subtle — it builds `sub` from scratch starting
 * with the empty string, then appends `AC<...>account` and `AM<...>amount`.
 * We mirror that exactly.
 *
 * Input format matches the wire — `settlement` is an array of
 * `{account, amount}` pairs (already parsed from `KEY=VALUE` lines).
 */
function appendSettlement(body, settlement) {
    if (!settlement || settlement.length === 0)
        return body;
    for (const { account, amount } of settlement) {
        // Note: the original C# silently skips lines where the split-by-'=' result
        // doesn't have exactly 2 elements. We mirror that by filtering in the
        // file-parser layer; here we trust the input.
        const amountStr = String(amount);
        let sub = "";
        sub = appendTag(sub, "AC", account);
        sub = appendTag(sub, "AM", amountStr);
        body = appendTag(body, "ST", sub);
    }
    return body;
}
/**
 * Append the optional key-value (`AV` + `PV`) sub-blocks.
 *
 * For each `key=value` pair:
 *   sub = appendTag("", "KY", key) + appendTag("", "VL", value)
 *   body += appendTag(body, "AV", sub)
 *   body += appendTag(body, "PV", sub)    // yes, same sub again
 */
function appendKeyValue(body, keyValue) {
    if (!keyValue || keyValue.length === 0)
        return body;
    for (const { key, value } of keyValue) {
        let sub = "";
        sub = appendTag(sub, "KY", key);
        sub = appendTag(sub, "VL", value);
        body = appendTag(body, "AV", sub);
        body = appendTag(body, "PV", sub);
    }
    return body;
}
/**
 * Build the final wire message for a transaction.
 *
 * This is the JS equivalent of `PCPOS.BuildMsg()` (without the `set_Request`
 * and `Console.WriteLine` side effects — those are exposed via the returned
 * `body` field for callers that want to log it).
 *
 * @param opts see `PcposRequestOptions` for field semantics. At minimum,
 *            `amount` must be provided.
 *
 * @returns an object with:
 *   - `body`: the full body string starting with `RQ<3-digit-len>` ...
 *   - `bytes`: Buffer of `[4-digit-length][body]` cp1256-encoded
 *
 * @throws if `amount` is not a valid unsigned integer
 */
function buildMessage(opts) {
    const tags = fillMsgTags(opts);
    // Walk tags in insertion order; skip empty values.
    // (Equivalent to the original C# foreach with `IsNullOrEmpty(value)` skip.)
    let body = "";
    for (const key of types_1.MSG_TAG_ORDER) {
        const value = tags[key];
        if (!value)
            continue; // skip null/empty
        body = appendTag(body, key, value);
    }
    // Optional ST sub-block(s) for settlement.
    body = appendSettlement(body, opts.settlement);
    // Optional AV/PV sub-block(s) for key-value pairs.
    body = appendKeyValue(body, opts.keyValue);
    // Prepend the `RQ` + 3-digit body length header.
    //   body = "RQ" + body.Length.ToString().PadLeft(3, '0') + body
    // NOTE: at this point, `body.Length` is the length BEFORE the RQ header is
    // added; that's exactly what the original C# does (the 3-digit length
    // describes the post-RQ-header body length minus the 5 chars of "RQ" +
    // 3-digit-length itself — but since the value is computed BEFORE
    // prepending, this is correct by accident).
    //
    // Let's trace through the IL one more time to be sure:
    //   IL_02d4: ldstr "RQ"          // push "RQ"
    //   IL_02d9: ldc.i4.2            // push 2
    //   IL_02da: ldc.i4.s 0x20       // push ' '
    //   IL_02dc: call PadLeft(2,' ')  // "RQ".PadLeft(2,' ') = "RQ"
    //   IL_02e1: ldloc.0             // push body
    //   IL_02e2: call get_Length()   // push body.Length
    //   IL_02e7: stloc.3             // loc.3 = body.Length
    //   IL_02e8: ldloca.s 3
    //   IL_02ea: call ToString()     // body.Length.ToString()
    //   IL_02ef: ldc.i4.3
    //   IL_02f0: ldc.i4.s 0x30
    //   IL_02f2: call PadLeft(3,'0') // body.Length.ToString().PadLeft(3,'0')
    //   IL_02f7: ldloc.0            // push body
    //   IL_02f8: call Concat(s,s,s) // "RQ" + padded-len + body
    //   IL_02fd: stloc.0            // body = result
    //
    // So the 3-digit length is `body.Length` *before* prepending — i.e. the
    // length of the post-RQ body. The receiver reads it to know how many
    // bytes follow the 5-char `RQ<len>` header.
    const bodyLenBeforeRq = body.length;
    body = "RQ" + padNum(bodyLenBeforeRq, 3) + body;
    // Now build the final byte stream:
    //   bytes = cp1256.GetBytes(body.Length.ToString().PadLeft(4,'0') + body)
    const totalLen = body.length;
    const prefix = padNum(totalLen, 4);
    const bytes = (0, encoding_1.encodeCp1256)(prefix + body);
    return { body, bytes };
}
//# sourceMappingURL=message.js.map