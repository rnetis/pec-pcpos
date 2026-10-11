/**
 * Shared types for the PEC PCPOS protocol library.
 *
 * Faithful port of `Intek.PcPosLibrary.PCPOS` (and friends) from the
 * original `Pec-PCPOS-WindowsService.exe` .NET assembly.
 */
/**
 * Transport connection type. Mirrors `Intek.PcPosLibrary.PCPOS/cnType`.
 *
 * - `LAN`    (value 0) — Talk to the POS over TCP/IP using `Ip:Port`.
 * - `SERIAL` (value 1) — Talk to the POS over a 19200/8/N/1 COM port.
 *
 * The wire-protocol is identical regardless of transport; only the byte
 * stream differs.
 */
export declare enum ConnectionType {
    LAN = 0,
    SERIAL = 1
}
/**
 * Transaction request parameters — the public, idiomatic-JS view of the
 * `Intek.PcPosLibrary.PCPOS` class's settable properties.
 *
 * Names follow the original `KEY=VALUE` request-file keys, not the C#
 * property names (which were opaque like `R1Holder`). Field semantics:
 *
 * @property amount             Required, in Rials (whole-number string).
 *                              e.g. `"10000"` = 1000 Tomans. Mirrors
 *                              `PCPOS.Amount` / file key `AMOUNT`.
 * @property type               `"LAN"` or `"SERIAL"`. Mirrors file key `TYPE`.
 *                              Determines which of `ip/port` vs `comPort` is used.
 * @property ip                 POS LAN IP, e.g. `"192.168.10.20"`. Required when
 *                              `type === "LAN"`. Mirrors `PCPOS.Ip` / file key `IP`.
 * @property port               POS LAN TCP port, e.g. `7020`. Required when
 *                              `type === "LAN"`. Mirrors `PCPOS.Port` / file key `PORT`.
 * @property comPort            OS serial port name, e.g. `"COM3"` or `"/dev/ttyS0"`.
 *                              Required when `type === "SERIAL"`.
 *                              Mirrors `PCPOS.ComPort` / file key `COMPORT`.
 * @property prCode             Processing code (6-digit string). Defaults to `"000000"`.
 *                              Mirrors `PCPOS.PrCode` / file key `PRCODE`.
 * @property currency           ISO 4217 numeric code, padded to 3 digits.
 *                              Defaults to `"364"` (Iranian Rial — IRN).
 *                              Mirrors `PCPOS.Currency` / file key `CURRENCY`.
 * @property cardholderReceipt  Free-text receipt body printed for the cardholder.
 *                              Maps to the `R1` wire tag. File key `CARDHOLDERRECEIPT`.
 * @property cardholderTitle    Free-text receipt title for the cardholder.
 *                              Maps to the `T1` wire tag. File key `CARDHOLDERTITLE`.
 * @property merchantReceipt    Free-text receipt body printed for the merchant.
 *                              Maps to the `R2` wire tag. File key `MERCHANTRECEIPT`.
 * @property merchantTitle      Free-text receipt title for the merchant.
 *                              Maps to the `T2` wire tag. File key `MERCHANTTITLE`.
 * @property service            Free-text service identifier.
 *                              Maps to the `SV` wire tag. File key `SERVICE`.
 * @property serviceGroup       Free-text service group identifier.
 *                              Maps to the `SG` wire tag. File key `SERVICEGROUP`.
 * @property settlement         Optional list of `{account, amount}` pairs for
 *                              multi-merchant settlement. Each pair becomes an
 *                              `ST` sub-block in the wire message.
 *                              File key `SETTELMENT` (note: original typo).
 * @property keyValue           Optional list of `{key, value}` pairs that get
 *                              emitted as `AV`/`PV` sub-blocks in the wire
 *                              message. File key `KEYVALUE`.
 */
export interface PcposRequestOptions {
    amount: string | number;
    type: "LAN" | "SERIAL" | ConnectionType;
    ip?: string;
    port?: number;
    comPort?: string;
    prCode?: string;
    currency?: string;
    cardholderReceipt?: string;
    cardholderTitle?: string;
    merchantReceipt?: string;
    merchantTitle?: string;
    service?: string;
    serviceGroup?: string;
    settlement?: Array<{
        account: string;
        amount: string | number;
    }>;
    keyValue?: Array<{
        key: string;
        value: string;
    }>;
}
/**
 * The parsed wire-level response. Each field corresponds to one of the
 * `Response::GetXXX()` helpers in the original `Intek.PcPosLibrary.Response`.
 *
 * A field is `""` when the corresponding tag was missing from the response
 * (the original C# returns the bare label string like `"PAN = "` in that
 * case; we mirror that exact behaviour for wire-compat, but also expose
 * a clean `null` via the optional typed accessor — TODO).
 *
 * @property responseCode   2-char code. `"00"` typically means success.
 *                          Source: `Response.GetTrxnResp()` (rawResponse.substr(14,2)).
 * @property traceId        Trace number. Source: `Response.GetTraceNo()` (TR tag).
 * @property pan            Primary Account Number (masked). Source: `PN` tag.
 * @property terminalId     POS terminal ID. Source: `TM` tag.
 * @property amount         Transaction amount as returned by POS. Source: `AM` tag.
 * @property rrn            Retrieval Reference Number. Source: `RN` tag.
 * @property dateTime       Full date/time as returned by POS. Source: `TI` tag.
 * @property date           Date portion (10 chars). Source: `TI` value substring.
 * @property time           Time portion (8 chars). Source: `TI` value substring.
 * @property serialNumber   POS serial number. Source: `SR` tag.
 * @property bankName       Persian bank name resolved from PAN's first 6 digits.
 *                          Source: `Response.GetBankName()` BIN lookup table.
 */
export interface PcposResponse {
    responseCode: string;
    traceId: string;
    pan: string;
    terminalId: string;
    amount: string;
    rrn: string;
    dateTime: string;
    date: string;
    time: string;
    serialNumber: string;
    bankName: string;
    /** The raw, tag-length-value response string (without the 4-digit length prefix). */
    rawResponse: string;
}
/**
 * Low-level result of `BuildMsg`. Exposed for debugging & for callers who
 * want to ship the bytes themselves.
 */
export interface BuildMsgResult {
    /** The full body string, including the `RQ` + 3-digit body length header. */
    body: string;
    /** The final bytes to send on the wire: 4-digit length prefix + body, cp1256-encoded. */
    bytes: Buffer;
}
/**
 * Backing-store view of the `Msg_Tags` dictionary that the original
 * `fillMsgParams()` populates. Insertion order matters — the wire bytes
 * emit fields in this exact order:
 *
 *   PR, AM, CU, R1, R2, T1, T2, SV, SG, AD, PD
 *
 * (`AD` is always emitted with an empty value and thus always skipped by
 *  BuildMsg's non-empty filter; `PD` is always `"1"`.)
 *
 * After this base block, the optional `ST` (settlement) and `AV`/`PV`
 * (key-value) sub-blocks are appended.
 */
export interface MsgTags {
    PR: string;
    AM: string;
    CU: string;
    R1: string;
    R2: string;
    T1: string;
    T2: string;
    SV: string;
    SG: string;
    AD: string;
    PD: string;
}
/** Tag-key order used by `fillMsgParams` in the original .NET library. */
export declare const MSG_TAG_ORDER: ReadonlyArray<keyof MsgTags>;
/**
 * A pluggable duplex transport — abstracts TCP and serial.
 *
 * Extends `EventEmitter` so the `PecPcpos` class can subscribe to
 * `connect` / `disconnect` / `error` events from any transport.
 */
export interface DuplexTransport extends EventEmitterLike {
    /** Send bytes to the POS. */
    write(data: Buffer): void | Promise<void>;
    /** Read the next chunk of bytes from the POS (resolves when data arrives). */
    read(maxLen: number): Promise<Buffer>;
    /** Read whatever is currently buffered (no waiting). */
    readExisting(): Promise<Buffer>;
    /** Close the transport. */
    close(): void;
    /** Whether the transport is currently open/connected. */
    readonly connected: boolean;
}
/**
 * Minimal EventEmitter-like contract that any transport must implement.
 * We don't pull in the actual `events` module type to keep the public
 * surface standalone.
 */
export interface EventEmitterLike {
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit(event: string | symbol, ...args: any[]): boolean;
    removeAllListeners(event?: string | symbol): this;
}
