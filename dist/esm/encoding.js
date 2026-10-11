/**
 * Windows-1256 (Arabic codepage) encoder/decoder for Node.js.
 *
 * The original PEC PCPOS .NET library uses `Encoding.GetEncoding(1256)` to
 * convert between .NET strings and the on-wire byte representation. Node's
 * Buffer doesn't support cp1256 natively (it depends on ICU), so we hand-roll
 * a tiny single-byte codec that is byte-for-byte compatible.
 *
 * Reference: https://en.wikipedia.org/wiki/Windows-1256
 */
import { CP1256_TO_UNICODE, UNICODE_TO_CP1256 } from "./cp1256";
/**
 * Encode a JS string into a Buffer of Windows-1256 bytes.
 *
 * Characters that have no cp1256 representation (e.g. CJK, emoji) are replaced
 * with 0x3F ('?'), matching .NET EncoderFallback.Default (which is the
 * "best-fit" replacement fallback in .NET — but for the PEC protocol the
 * only non-cp1256 chars encountered in the payload would already be
 * rejected by the original `Encoding.GetEncoding(1256)` default fallback).
 *
 * @param s the string to encode
 * @returns a Buffer of length = s.length (single-byte codepage)
 */
export function encodeCp1256(s) {
    const out = Buffer.allocUnsafe(s.length);
    for (let i = 0; i < s.length; i++) {
        const cp = s.codePointAt(i);
        const b = UNICODE_TO_CP1256.get(cp);
        if (b === undefined) {
            // Fallback: '?' — matches .NET's default replacement fallback behaviour.
            out[i] = 0x3f;
        }
        else {
            out[i] = b;
        }
    }
    return out;
}
/**
 * Decode a Buffer (or Uint8Array) of Windows-1256 bytes into a JS string.
 *
 * Each byte maps to exactly one Unicode codepoint (cp1256 is single-byte).
 *
 * @param bytes the buffer to decode
 * @param start optional start offset (default 0)
 * @param end optional end offset (default bytes.length)
 */
export function decodeCp1256(bytes, start = 0, end = bytes.length) {
    // Quick path for empty range
    if (end <= start)
        return "";
    const len = end - start;
    // Single-byte codepage: each byte → one BMP codepoint, so the resulting
    // string has the same length as the byte range. We build it via an array
    // of codepoints and use String.fromCodePoint for safety.
    const codepoints = new Array(len);
    for (let i = 0; i < len; i++) {
        const byte = bytes[start + i];
        codepoints[i] = CP1256_TO_UNICODE[byte];
    }
    // For BMP-only codepoints (all cp1256 chars are in the BMP), String.fromCharCode
    // is faster than String.fromCodePoint and produces the same result.
    // We chunk in groups of 0x3FFF to avoid call-stack limits on very long inputs.
    const CHUNK = 0x3fff;
    let result = "";
    for (let i = 0; i < codepoints.length; i += CHUNK) {
        const slice = codepoints.slice(i, i + CHUNK);
        result += String.fromCharCode.apply(null, slice);
    }
    return result;
}
//# sourceMappingURL=encoding.js.map