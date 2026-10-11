/**
 * Pluggable duplex-stream transport for PEC PCPOS.
 *
 * This transport wraps any Node.js duplex stream (e.g. a `serialport`
 * SerialPort, a child-process stdio, a `net.Socket`, a USB CDC endpoint,
 * etc.) and exposes it through the `DuplexTransport` interface so the
 * `PCPOS` class can drive it the same way as the LAN transport.
 *
 * The original .NET library talks to the POS over a 19200 baud 8/N/1
 * COM port. Node's `serialport` package is the natural equivalent, but
 * we don't bundle it as a hard dependency — instead, callers pass any
 * duplex stream they like:
 *
 * ```ts
 * import { SerialPort } from "serialport";
 * import { PecPcpos } from "pec-pcpos";
 *
 * const port = new SerialPort({
 *   path: "COM3",
 *   baudRate: 19200,
 *   dataBits: 8,
 *   parity: "none",
 *   stopBits: 1,
 *   autoOpen: false,
 * });
 * await port.open();
 *
 * const pcpos = new PecPcpos({ transport: new StreamTransport(port) });
 * const resp = await pcpos.sendTransaction({ amount: "1000", ... });
 * ```
 *
 * Wire-protocol-wise, the original `sendToSerialPort()` does:
 *   1. Close any open SerialPort.
 *   2. Construct a new SerialPort(ComPort, 19200, None, 8, One).
 *   3. Set RtsEnable = false, DtrEnable = false, ReadTimeout = 60000 ms.
 *   4. Open the port.
 *   5. DiscardInBuffer + DiscardOutBuffer.
 *   6. Write the full `finaMsg` byte buffer.
 *   7. Loop: read 4 bytes (the length prefix), parse as int, then keep
 *      reading (using `ReadExisting()`) until we have at least that many
 *      chars in the response string.
 *   8. UTF-8 decode the received bytes into a string and store on Response.
 *   9. Close the port.
 *
 * We faithfully implement steps 6-9. Steps 1-5 are the caller's
 * responsibility (they're transport-construction concerns). The `read`
 * method here implements the loop in step 7.
 *
 * NOTE: the original uses UTF-8 (not cp1256!) to decode the serial
 * response. We mirror that exactly. (This is inconsistent with the LAN
 * path, which uses ASCII — but we're faithfully reproducing the original
 * behaviour, not "fixing" it.)
 */
import { EventEmitter } from "events";
import type { DuplexTransport } from "../types";
/** Any object that looks like a Node.js Readable/Writable stream. */
export interface DuplexStreamLike {
    write(data: Buffer, callback?: (err?: Error | null | undefined) => void): boolean;
    on(event: "data" | "close" | "error", listener: (...args: any[]) => void): this;
    once(event: "data" | "close" | "error", listener: (...args: any[]) => void): this;
    readonly destroyed?: boolean;
    readonly readable?: boolean;
    readonly writable?: boolean;
    close?(cb?: () => void): void;
    destroy?(err?: Error): void;
}
/**
 * Pluggable stream transport. Wraps a duplex stream (e.g. `serialport`)
 * and exposes it via `DuplexTransport`.
 *
 * Events:
 *   - `connect`    — first bytes arrive (or stream becomes readable)
 *   - `disconnect` — stream closed
 *   - `error`      — stream error
 */
export declare class StreamTransport extends EventEmitter implements DuplexTransport {
    private stream;
    private _connected;
    private recvBuffer;
    private recvSize;
    private readWaiters;
    constructor(stream: DuplexStreamLike, alreadyOpen?: boolean);
    private attach;
    get connected(): boolean;
    write(data: Buffer): Promise<void>;
    read(maxLen: number): Promise<Buffer>;
    readExisting(): Promise<Buffer>;
    close(): void;
    private consumeUpTo;
    private pumpWaiters;
}
/**
 * Convenience helper: send a single message over a duplex stream and
 * read the response using the original .NET serial-response read loop.
 *
 * The read loop:
 *   1. Read the first 4 bytes (the ASCII decimal length prefix).
 *   2. Parse them as an integer → `expectedLen`.
 *   3. Keep reading (`ReadExisting()`) until we have ≥ `expectedLen` chars.
 *
 * The returned Buffer contains the full response including the 4-byte
 * length prefix.
 *
 * @param stream the duplex stream (e.g. serialport instance)
 * @param bytes the message bytes to send
 * @param readTimeoutMs overall read timeout (default 60_000 ms, matching
 *                      the original `set_ReadTimeout(60000)`)
 */
export declare function sendOverStream(stream: DuplexStreamLike, bytes: Buffer, readTimeoutMs?: number): Promise<Buffer>;
/**
 * Shared send+receive routine used by both `sendOverLan` and
 * `sendOverStream`. The difference between the two is just how the
 * transport is constructed; the send+receive protocol is the same:
 *   - write the bytes
 *   - read 4 bytes (length prefix)
 *   - keep reading until we have at least `length` bytes
 *
 * For LAN, the original .NET uses a single `Stream.Read(buf, 0, 500)` call
 * that returns whatever's available (often the whole response in one read).
 * For serial, the original uses the read-4-then-read-more loop.
 *
 * We use the serial-style loop for both, because:
 *   1. It works correctly regardless of how TCP fragments the data.
 *   2. The original LAN implementation has a latent bug: if the response
 *      is larger than 500 bytes, it would silently truncate. The serial
 *      path doesn't have that bug. We pick the more-correct behaviour.
 *
 * If you need to reproduce the LAN path's exact 500-byte single-read
 * behaviour for compatibility testing, use `sendOverLan()` directly.
 */
export declare function sendOverTransport(t: DuplexTransport, bytes: Buffer, readTimeoutMs: number): Promise<Buffer>;
