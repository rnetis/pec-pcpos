/**
 * LAN (TCP) transport for PEC PCPOS.
 *
 * Faithful port of `Intek.PcPosLibrary.PCPOS.sendToLan()` from the
 * original .NET assembly.
 *
 * Behaviour:
 *   1. Open a `TcpClient(Ip, Port)`.
 *   2. Get its `NetworkStream`.
 *   3. Write the entire `finaMsg` byte buffer.
 *   4. Allocate a 500-byte receive buffer.
 *   5. Read up to 500 bytes in a single `Stream.Read()` call.
 *   6. Decode the received bytes as ASCII into a string.
 *   7. Set `Response.RawResponse` to that string.
 *   8. Close the stream and the TcpClient.
 *
 * NOTE: the original C# uses `Encoding.get_ASCII()` to decode the LAN
 * response (but uses cp1256 to encode the request, and UTF-8 for the
 * serial response). We mirror that — ASCII for LAN.
 *
 * This is somewhat questionable for Persian bank-name strings, but it
 * matches the original wire behaviour. If the POS sends back any bytes
 * > 127, ASCII decoding will produce replacement chars (`?` in .NET's
 * default fallback). In practice, the response code, trace, terminal ID,
 * amount, RRN, date, time, and serial are all ASCII fields — only the
 * PAN can contain Persian-encoded bytes, and the original parser only
 * looks at the first 6 (ASCII) digits of the PAN for BIN lookup anyway.
 */
import * as net from "net";
import { EventEmitter } from "events";
const LAN_RECV_BUFFER_SIZE = 500;
const LAN_DEFAULT_TIMEOUT_MS = 10000;
/**
 * LAN transport — implements `DuplexTransport` over Node's `net.Socket`.
 *
 * Events emitted (via the returned `EventEmitter` interface — listeners
 * can also subscribe via `pcpos.on('connect' | 'disconnect' | 'error')`):
 *   - `connect`    — socket connected
 *   - `disconnect` — socket closed
 *   - `error`      — socket error
 */
export class LanTransport extends EventEmitter {
    constructor(ip, port, timeoutMs = LAN_DEFAULT_TIMEOUT_MS) {
        super();
        this.socket = null;
        this._connected = false;
        /** Buffered incoming bytes. Consumed by `read()`. */
        this.recvBuffer = [];
        this.recvSize = 0;
        /** Resolvers waiting on `read()`. */
        this.readWaiters = [];
        this.ip = ip;
        this.port = port;
        this.timeoutMs = timeoutMs;
    }
    get connected() {
        return this._connected;
    }
    /**
     * Open the underlying TCP connection.
     *
     * Returns a Promise that resolves once the socket is connected.
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.socket && this._connected) {
                resolve();
                return;
            }
            const socket = new net.Socket();
            socket.setTimeout(this.timeoutMs);
            socket.on("connect", () => {
                this._connected = true;
                this.emit("connect");
                resolve();
            });
            socket.on("data", (data) => {
                this.recvBuffer.push(data);
                this.recvSize += data.length;
                this.pumpWaiters();
            });
            socket.on("error", (err) => {
                this.emit("error", err);
                if (!this._connected) {
                    reject(err);
                }
                else {
                    // Reject any pending reads with the error.
                    for (const w of this.readWaiters)
                        w.reject(err);
                    this.readWaiters = [];
                }
            });
            socket.on("close", () => {
                this._connected = false;
                this.emit("disconnect");
                // Reject any pending reads with EOF.
                for (const w of this.readWaiters)
                    w.reject(new Error("connection closed"));
                this.readWaiters = [];
            });
            socket.on("timeout", () => {
                const err = new Error(`socket timeout after ${this.timeoutMs}ms`);
                this.emit("error", err);
                // Reject pending reads.
                for (const w of this.readWaiters)
                    w.reject(err);
                this.readWaiters = [];
                socket.destroy();
            });
            socket.connect(this.port, this.ip);
            this.socket = socket;
        });
    }
    /**
     * Write bytes to the POS. Connects automatically if not already
     * connected (mirroring the original `new TcpClient(ip, port)` ctor).
     */
    async write(data) {
        if (!this.socket || !this._connected) {
            await this.connect();
        }
        if (!this.socket) {
            throw new Error("LAN transport: socket not open after connect");
        }
        return new Promise((resolve, reject) => {
            this.socket.write(data, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
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
    async read(maxLen = LAN_RECV_BUFFER_SIZE) {
        if (this.recvSize > 0) {
            const out = this.consumeUpTo(maxLen);
            if (out.length > 0)
                return out;
        }
        if (!this.socket || !this._connected) {
            throw new Error("LAN transport: not connected");
        }
        return new Promise((resolve, reject) => {
            this.readWaiters.push({ resolve, reject, maxLen });
        });
    }
    /**
     * Read whatever is currently buffered, without waiting.
     *
     * Mirrors .NET `SerialPort.ReadExisting()`. Used by the serial
     * transport's main read loop.
     */
    async readExisting() {
        if (this.recvSize === 0)
            return Buffer.alloc(0);
        return this.consumeUpTo(this.recvSize);
    }
    close() {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        this._connected = false;
        this.recvBuffer = [];
        this.recvSize = 0;
        for (const w of this.readWaiters)
            w.reject(new Error("connection closed"));
        this.readWaiters = [];
    }
    consumeUpTo(maxLen) {
        const want = Math.min(maxLen, this.recvSize);
        if (want <= 0)
            return Buffer.alloc(0);
        const all = Buffer.concat(this.recvBuffer);
        const out = all.subarray(0, want);
        const rest = all.subarray(want);
        this.recvBuffer = rest.length > 0 ? [rest] : [];
        this.recvSize = rest.length;
        return out;
    }
    pumpWaiters() {
        while (this.readWaiters.length > 0 && this.recvSize > 0) {
            const w = this.readWaiters[0];
            const out = this.consumeUpTo(w.maxLen);
            if (out.length > 0) {
                this.readWaiters.shift();
                w.resolve(out);
            }
            else {
                break;
            }
        }
    }
}
/**
 * Convenience helper: send a single message to a POS over LAN (TCP) and
 * read the response. This is a one-shot equivalent of the original
 * `sendToLan()` method.
 *
 * @returns the raw received bytes (≤ 500 bytes by default).
 */
export async function sendOverLan(ip, port, bytes, timeoutMs = LAN_DEFAULT_TIMEOUT_MS) {
    const t = new LanTransport(ip, port, timeoutMs);
    try {
        await t.write(bytes);
        return await t.read(LAN_RECV_BUFFER_SIZE);
    }
    finally {
        t.close();
    }
}
//# sourceMappingURL=lan.js.map