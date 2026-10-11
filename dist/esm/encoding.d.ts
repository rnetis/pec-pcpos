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
export declare function encodeCp1256(s: string): Buffer;
/**
 * Decode a Buffer (or Uint8Array) of Windows-1256 bytes into a JS string.
 *
 * Each byte maps to exactly one Unicode codepoint (cp1256 is single-byte).
 *
 * @param bytes the buffer to decode
 * @param start optional start offset (default 0)
 * @param end optional end offset (default bytes.length)
 */
export declare function decodeCp1256(bytes: Uint8Array | Buffer, start?: number, end?: number): string;
