import { EventEmitter } from "events";
import type { DuplexTransport } from "../types";
/**
 * LAN transport — implements `DuplexTransport` over Node's `net.Socket`.
 *
 * Events emitted (via the returned `EventEmitter` interface — listeners
 * can also subscribe via `pcpos.on('connect' | 'disconnect' | 'error')`):
 *   - `connect`    — socket connected
 *   - `disconnect` — socket closed
 *   - `error`      — socket error
 */
export declare class LanTransport extends EventEmitter implements DuplexTransport {
    private socket;
    private readonly ip;
    private readonly port;
    private readonly timeoutMs;
    private _connected;
    /** Buffered incoming bytes. Consumed by `read()`. */
    private recvBuffer;
    private recvSize;
    /** Resolvers waiting on `read()`. */
    private readWaiters;
    constructor(ip: string, port: number, timeoutMs?: number);
    get connected(): boolean;
    /**
     * Open the underlying TCP connection.
     *
     * Returns a Promise that resolves once the socket is connected.
     */
    connect(): Promise<void>;
    /**
     * Write bytes to the POS. Connects automatically if not already
     * connected (mirroring the original `new TcpClient(ip, port)` ctor).
     */
    write(data: Buffer): Promise<void>;
    /**
     * Read up to `maxLen` bytes from the POS.
     *
     * Resolves when at least 1 byte is available (or EOF/error). Returns
     * at most `maxLen` bytes.
     *
     * NOTE: the original `sendToLan()` allocates a 500-byte buffer and does
     * a single `Stream.Read(buf, 0, 500)`. We keep that exact behaviour
     * by defaulting `maxLen` to 500.
     */
    read(maxLen?: number): Promise<Buffer>;
    /**
     * Read whatever is currently buffered, without waiting.
     *
     * Mirrors .NET `SerialPort.ReadExisting()`. Used by the serial
     * transport's main read loop.
     */
    readExisting(): Promise<Buffer>;
    close(): void;
    private consumeUpTo;
    private pumpWaiters;
}
/**
 * Convenience helper: send a single message to a POS over LAN (TCP) and
 * read the response. This is a one-shot equivalent of the original
 * `sendToLan()` method.
 *
 * @returns the raw received bytes (≤ 500 bytes by default).
 */
export declare function sendOverLan(ip: string, port: number, bytes: Buffer, timeoutMs?: number): Promise<Buffer>;
