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
import { buildMessage } from "./message";
import { decodeResponse, formatParsedResponse } from "./response";
import type {
  PcposRequestOptions,
  PcposResponse,
  DuplexTransport,
} from "./types";
import { LanTransport } from "./transports/lan";
import { StreamTransport, sendOverTransport, type DuplexStreamLike } from "./transports/stream";

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
export class PecPcpos extends EventEmitter {
  private readonly opts: PecPcposOptions;
  private _lastRequest?: { body: string; bytes: Buffer };
  private _lastResponse?: PcposResponse;

  constructor(opts: PecPcposOptions = {}) {
    super();
    this.opts = opts;
  }

  /**
   * The body string of the most recent `sendTransaction` call.
   * Useful for debugging — equivalent to the `PCPOS.Request` property.
   */
  get lastRequest(): { body: string; bytes: Buffer } | undefined {
    return this._lastRequest;
  }

  /**
   * The parsed response of the most recent `sendTransaction` call.
   * Equivalent to the `PCPOS.Response` property.
   */
  get lastResponse(): PcposResponse | undefined {
    return this._lastResponse;
  }

  /**
   * Send a transaction and receive the parsed response.
   *
   * @param req the request parameters
   * @returns the parsed response
   */
  async sendTransaction(req: PcposRequestOptions): Promise<PcposResponse> {
    // 1. Build the wire message.
    const built = buildMessage({
      amount: req.amount,
      prCode: req.prCode,
      currency: req.currency,
      cardholderReceipt: req.cardholderReceipt,
      merchantReceipt: req.merchantReceipt,
      cardholderTitle: req.cardholderTitle,
      merchantTitle: req.merchantTitle,
      service: req.service,
      serviceGroup: req.serviceGroup,
      settlement: req.settlement,
      keyValue: req.keyValue,
    });
    this._lastRequest = built;

    // 2. Resolve the transport.
    const { transport, closeWhenDone } = this.resolveTransport(req);

    // Forward transport events.
    const onConnect = () => this.emit("connect");
    const onDisconnect = () => this.emit("disconnect");
    const onError = (e: Error) => this.emit("error", e);
    transport.on("connect", onConnect);
    transport.on("disconnect", onDisconnect);
    transport.on("error", onError);

    try {
      // 3. Send + receive using the length-prefixed read loop.
      this.emit("sent", built.bytes);
      const received = await sendOverTransport(
        transport,
        built.bytes,
        this.opts.timeoutMs ?? 60_000,
      );
      this.emit("received", received);

      // 4. Decode the response.
      // The original uses ASCII for LAN, UTF-8 for serial. We use cp1256
      // (which is a superset of both for the response fields actually
      // used — all response tags are ASCII, and the PAN's Persian chars
      // are better preserved with cp1256 than ASCII).
      const resp = decodeResponse(received);
      this._lastResponse = resp;
      return resp;
    } finally {
      transport.off("connect", onConnect);
      transport.off("disconnect", onDisconnect);
      transport.off("error", onError);
      if (closeWhenDone) {
        transport.close();
      }
    }
  }

  /**
   * Test the connection to the POS without sending a transaction.
   *
   * For LAN: attempts a TCP connect to `ip:port`.
   * For serial: returns true if the stream is currently open.
   *
   * Equivalent to the original `PCPOS.TestConnection()`.
   */
  async testConnection(req: Pick<PcposRequestOptions, "type" | "ip" | "port" | "comPort">): Promise<boolean> {
    try {
      if (req.type === "SERIAL" || req.type === 1) {
        // For serial, just check the stream is open.
        if (this.opts.serialStream) {
          return (this.opts.serialStream as any).readable !== false;
        }
        if (this.opts.transport && this.opts.transport !== "lan" && this.opts.transport !== "serial") {
          return this.opts.transport.connected;
        }
        return false;
      }
      // LAN
      const ip = req.ip ?? this.opts.ip;
      const port = req.port ?? this.opts.port;
      if (!ip || !port) return false;
      const t = new LanTransport(ip, port, this.opts.timeoutMs ?? 5_000);
      await t.connect();
      t.close();
      return true;
    } catch (err) {
      // Original C# catches Exception, prints "TestConnection: " + msg,
      // and returns false. We mirror that.
      const msg = err instanceof Error ? err.message : String(err);
      this.emit("error", new Error(`TestConnection: ${msg}`));
      return false;
    }
  }

  /**
   * Build the wire message for a request WITHOUT sending it.
   * Useful for inspecting what would be sent, or for batching.
   */
  buildRequest(req: PcposRequestOptions): { body: string; bytes: Buffer } {
    return buildMessage({
      amount: req.amount,
      prCode: req.prCode,
      currency: req.currency,
      cardholderReceipt: req.cardholderReceipt,
      merchantReceipt: req.merchantReceipt,
      cardholderTitle: req.cardholderTitle,
      merchantTitle: req.merchantTitle,
      service: req.service,
      serviceGroup: req.serviceGroup,
      settlement: req.settlement,
      keyValue: req.keyValue,
    });
  }

  /**
   * Format a parsed response as a multi-line string (same format the
   * original Windows Service writes to the response file).
   */
  formatResponse(resp: PcposResponse): string {
    // The original calls Response.GetParsedResp(), which formats each
    // field as "Label = value\r\n". We just call formatParsedResponse
    // on the raw response.
    return formatParsedResponse(resp.rawResponse);
  }

  // ---- private ----

  private resolveTransport(req: PcposRequestOptions): {
    transport: DuplexTransport;
    closeWhenDone: boolean;
  } {
    // Precedence:
    //   1. Caller-supplied transport in this.opts.transport (instance)
    //   2. Caller-supplied "lan" / "serial" hint + this.opts.ip/port/serialStream
    //   3. Fall back to req.type + this.opts.ip/port/serialStream

    const t = this.opts.transport;
    if (t && t !== "lan" && t !== "serial") {
      return { transport: t, closeWhenDone: false };
    }

    const wantType =
      t === "lan" || t === "serial"
        ? t
        : typeof req.type === "string"
        ? (req.type as "lan" | "serial").toLowerCase()
        : "lan";

    if (wantType === "lan") {
      const ip = req.ip ?? this.opts.ip;
      const port = req.port ?? this.opts.port;
      if (!ip || !port) {
        throw new Error(
          "PecPcpos: LAN transport requires `ip` and `port` (set on PecPcposOptions or per-request)",
        );
      }
      const lan = new LanTransport(ip, port, this.opts.timeoutMs ?? 10_000);
      return { transport: lan, closeWhenDone: true };
    }

    // serial
    const stream = this.opts.serialStream;
    if (!stream) {
      throw new Error(
        "PecPcpos: SERIAL transport requires `serialStream` (a duplex stream like a serialport instance) on PecPcposOptions",
      );
    }
    const s = new StreamTransport(stream, true);
    return { transport: s, closeWhenDone: false };
  }
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
export async function sendTransaction(req: PcposRequestOptions & {
  timeoutMs?: number;
}): Promise<PcposResponse> {
  const built = buildMessage({
    amount: req.amount,
    prCode: req.prCode,
    currency: req.currency,
    cardholderReceipt: req.cardholderReceipt,
    merchantReceipt: req.merchantReceipt,
    cardholderTitle: req.cardholderTitle,
    merchantTitle: req.merchantTitle,
    service: req.service,
    serviceGroup: req.serviceGroup,
    settlement: req.settlement,
    keyValue: req.keyValue,
  });

  let transport: DuplexTransport;
  let closeWhenDone: boolean;
  if (req.type === "LAN" || req.type === 0) {
    if (!req.ip || !req.port) {
      throw new Error("sendTransaction: LAN requires `ip` and `port`");
    }
    transport = new LanTransport(req.ip, req.port, req.timeoutMs ?? 10_000);
    closeWhenDone = true;
  } else if (req.type === "SERIAL" || req.type === 1) {
    if (!req.comPort) {
      throw new Error("sendTransaction: SERIAL requires `comPort`");
    }
    throw new Error(
      "sendTransaction: SERIAL requires the caller to provide a duplex stream " +
        "(e.g. serialport). Use `new PecPcpos({ transport: new StreamTransport(port) })` " +
        "instead, since this helper cannot auto-construct a serialport instance.",
    );
  } else {
    throw new Error(`sendTransaction: invalid type ${JSON.stringify(req.type)}`);
  }

  try {
    const received = await sendOverTransport(
      transport,
      built.bytes,
      req.timeoutMs ?? 60_000,
    );
    return decodeResponse(received);
  } finally {
    if (closeWhenDone) transport.close();
  }
}
