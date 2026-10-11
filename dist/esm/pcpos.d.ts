/**
 * High-level PCPOS client — the public Node.js API for the PEC PCPOS
 * protocol.
 *
 * This is the user-facing reimplementation of `Intek.PcPosLibrary.PCPOS`.
 * Unlike the original (which was imperative + stateful), we expose a
 * Promise-based, stateless-per-call API with an EventEmitter for
 * connection state changes.
 *
 * Usage:
 *
 * ```ts
 * import { PecPcpos, LanTransport, StreamTransport } from "pec-pcpos";
 *
 * // LAN
 * const pcpos = new PecPcpos();
 * const resp = await pcpos.sendTransaction({
 *   amount: "10000",
 *   type: "LAN",
 *   ip: "192.168.10.20",
 *   port: 7020,
 *   prCode: "000000",
 *   currency: "364",
 * });
 * console.log(resp.responseCode, resp.rrn, resp.bankName);
 *
 * // Serial
 * import { SerialPort } from "serialport";
 * const port = new SerialPort({
 *   path: "COM3",
 *   baudRate: 19200,
 *   // ... 8/N/1
 *   autoOpen: false,
 * });
 * await port.open();
 *
 * const pcposSerial = new PecPcpos({
 *   transport: new StreamTransport(port),
 * });
 * const resp2 = await pcposSerial.sendTransaction({
 *   amount: "10000",
 *   type: "SERIAL",
 *   comPort: "COM3",
 * });
 * ```
 *
 * Events (EventEmitter):
 *   - `connect`    — first byte received from POS (or TCP connect)
 *   - `disconnect` — transport closed
 *   - `error`      — transport error (also surfaced via Promise rejection)
 *   - `sent`       — emitted with the sent Buffer (the full wire bytes)
 *   - `received`   — emitted with the raw received Buffer
 */
import { EventEmitter } from "events";
import type { PcposRequestOptions, PcposResponse, DuplexTransport } from "./types";
import { type DuplexStreamLike } from "./transports/stream";
/** Options for constructing a `PecPcpos` instance. */
export interface PecPcposOptions {
    /**
     * Pre-built transport. If provided, this transport is used for all
     * `sendTransaction` calls. Use this when you need fine-grained control
     * over the transport (e.g. providing a `serialport` instance via
     * `StreamTransport`).
     */
    transport?: DuplexTransport | "lan" | "serial";
    /**
     * For LAN mode (when `transport` is not provided): the POS IP.
     * Required if no transport is provided and `type` will be `LAN`.
     */
    ip?: string;
    /**
     * For LAN mode (when `transport` is not provided): the POS TCP port.
     * Required if no transport is provided and `type` will be `LAN`.
     */
    port?: number;
    /**
     * For serial mode (when `transport` is not provided): the duplex
     * stream to use (e.g. a `serialport` instance). Required if no
     * transport is provided and `type` will be `SERIAL`.
     */
    serialStream?: DuplexStreamLike;
    /**
     * Overall read timeout (ms). Default 60_000 (matching the original
     * `set_ReadTimeout(60000)` for serial, and 10_000 for LAN — but we
     * default to the larger of the two so the same setting works for both).
     */
    timeoutMs?: number;
}
/**
 * PEC PCPOS high-level client.
 *
 * Construct once, call `sendTransaction()` per transaction.
 *
 * Each `sendTransaction` call:
 *   1. Builds the wire message via `buildMessage(opts)`.
 *   2. Opens (or reuses) the transport.
 *   3. Writes the bytes.
 *   4. Reads the length-prefixed response (4-byte ASCII length + body).
 *   5. Decodes the response as cp1256 → string → structured object.
 *   6. Closes the transport (for one-shot LAN mode) OR keeps it open
 *      (when a pre-built transport was supplied).
 *   7. Resolves the Promise with the `PcposResponse`.
 */
export declare class PecPcpos extends EventEmitter {
    private readonly opts;
    private _lastRequest?;
    private _lastResponse?;
    constructor(opts?: PecPcposOptions);
    /**
     * The body string of the most recent `sendTransaction` call.
     * Useful for debugging — equivalent to the `PCPOS.Request` property.
     */
    get lastRequest(): {
        body: string;
        bytes: Buffer;
    } | undefined;
    /**
     * The parsed response of the most recent `sendTransaction` call.
     * Equivalent to the `PCPOS.Response` property.
     */
    get lastResponse(): PcposResponse | undefined;
    /**
     * Send a transaction and receive the parsed response.
     *
     * @param req the request parameters
     * @returns the parsed response
     */
    sendTransaction(req: PcposRequestOptions): Promise<PcposResponse>;
    /**
     * Test the connection to the POS without sending a transaction.
     *
     * For LAN: attempts a TCP connect to `ip:port`.
     * For serial: returns true if the stream is currently open.
     *
     * Equivalent to the original `PCPOS.TestConnection()`.
     */
    testConnection(req: Pick<PcposRequestOptions, "type" | "ip" | "port" | "comPort">): Promise<boolean>;
    /**
     * Build the wire message for a request WITHOUT sending it.
     * Useful for inspecting what would be sent, or for batching.
     */
    buildRequest(req: PcposRequestOptions): {
        body: string;
        bytes: Buffer;
    };
    /**
     * Format a parsed response as a multi-line string (same format the
     * original Windows Service writes to the response file).
     */
    formatResponse(resp: PcposResponse): string;
    private resolveTransport;
}
/**
 * Lower-level one-shot helper: send a transaction without setting up a
 * `PecPcpos` instance.
 *
 * Equivalent to the original `new PCPOS(); set_*; send_transaction()`
 * dance, all in one call.
 *
 * @param req the request options
 * @returns the parsed response
 */
export declare function sendTransaction(req: PcposRequestOptions & {
    timeoutMs?: number;
}): Promise<PcposResponse>;
