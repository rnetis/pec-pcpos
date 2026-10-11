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
/**
 * Pluggable stream transport. Wraps a duplex stream (e.g. `serialport`)
 * and exposes it via `DuplexTransport`.
 *
 * Events:
 *   - `connect`    — first bytes arrive (or stream becomes readable)
 *   - `disconnect` — stream closed
 *   - `error`      — stream error
 */
export class StreamTransport extends EventEmitter {
    constructor(stream, alreadyOpen = true) {
        super();
        this.recvBuffer = [];
        this.recvSize = 0;
        this.readWaiters = [];
        this.stream = stream;
        this._connected = alreadyOpen;
        this.attach();
    }
    attach() {
        const s = this.stream;
        const onData = (data) => {
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            if (!this._connected) {
                this._connected = true;
                this.emit("connect");
            }
            this.recvBuffer.push(buf);
            this.recvSize += buf.length;
            this.pumpWaiters();
        };
        const onClose = () => {
            this._connected = false;
            this.emit("disconnect");
            for (const w of this.readWaiters)
                w.reject(new Error("stream closed"));
            this.readWaiters = [];
        };
        const onError = (err) => {
            this.emit("error", err);
            for (const w of this.readWaiters)
                w.reject(err);
            this.readWaiters = [];
        };
        // Some streams emit 'data' as a Buffer, some as Uint8Array. Either way,
        // we normalize to Buffer.
        s.on("data", onData);
        s.on("close", onClose);
        s.on("error", onError);
        // Keep refs so we could detach later (not exposed in v1).
        this._listeners = { data: onData, close: onClose, error: onError };
    }
    get connected() {
        return this._connected;
    }
    async write(data) {
        return new Promise((resolve, reject) => {
            if (!this.stream.writable) {
                reject(new Error("stream transport: not writable"));
                return;
            }
            const ok = this.stream.write(data, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
            // If `write` returns false, the stream is internally buffering; the
            // callback will still fire once the bytes are flushed.
            void ok;
        });
    }
    async read(maxLen) {
        if (this.recvSize > 0) {
            const out = this.consumeUpTo(maxLen);
            if (out.length > 0)
                return out;
        }
        if (!this._connected) {
            throw new Error("stream transport: not connected");
        }
        return new Promise((resolve, reject) => {
            this.readWaiters.push({ resolve, reject, maxLen });
        });
    }
    async readExisting() {
        if (this.recvSize === 0)
            return Buffer.alloc(0);
        return this.consumeUpTo(this.recvSize);
    }
    close() {
        this._connected = false;
        const s = this.stream;
        try {
            if (typeof s.destroy === "function")
                s.destroy();
            else if (typeof s.close === "function")
                s.close();
        }
        catch {
            /* swallow */
        }
        for (const w of this.readWaiters)
            w.reject(new Error("stream closed"));
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
export async function sendOverStream(stream, bytes, readTimeoutMs = 60000) {
    const t = new StreamTransport(stream, true);
    try {
        return await sendOverTransport(t, bytes, readTimeoutMs);
    }
    finally {
        // Don't close the underlying stream — caller owns it.
        t.removeAllListeners();
    }
}
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
export async function sendOverTransport(t, bytes, readTimeoutMs) {
    // Set a hard timeout for the entire read.
    let timer = null;
    const timeoutP = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`read timeout after ${readTimeoutMs}ms`));
        }, readTimeoutMs);
    });
    try {
        const readP = (async () => {
            await t.write(bytes);
            // Read 4-byte length prefix.
            let prefix = Buffer.alloc(0);
            while (prefix.length < 4) {
                const chunk = await t.read(4 - prefix.length);
                if (chunk.length === 0) {
                    throw new Error("stream ended while reading length prefix");
                }
                prefix = Buffer.concat([prefix, chunk]);
            }
            const lenStr = prefix.toString("ascii");
            const expectedLen = parseInt(lenStr, 10);
            if (!Number.isFinite(expectedLen) || expectedLen < 0) {
                throw new Error(`invalid length prefix: ${JSON.stringify(lenStr)}`);
            }
            // Read the body.
            let body = Buffer.alloc(0);
            while (body.length < expectedLen) {
                const chunk = await t.read(expectedLen - body.length);
                if (chunk.length === 0)
                    break;
                body = Buffer.concat([body, chunk]);
            }
            return Buffer.concat([prefix, body]);
        })();
        return await Promise.race([readP, timeoutP]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
//# sourceMappingURL=stream.js.map