# pec-pcpos

> Pure-Node.js reimplementation of the **Intek.PcPosLibrary** protocol
> library and the **Pec-PCPOS-WindowsService** file-bridge service.

[![Tests](https://img.shields.io/badge/tests-75%2F75%20passing-brightgreen)](#tests)
[![Node](https://img.shields.io/badge/node-%3E%3D14-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Reverse-engineered from `Pec-PCPOS-WindowsService.exe` — a small .NET 4.5.2
assembly (Copyright © 2017) that ships with **PEC** (Parsian Electronic
Card) POS terminals in Iran. The library speaks the POS's tag-length-value
wire protocol over TCP/IP (LAN) or 19200 baud 8N1 serial, and includes a
22-bank Persian BIN lookup table for bank-name identification.

The original `.exe` has two parts; this package faithfully reimplements
both:

| Original (.NET)                         | This package                    |
| --------------------------------------- | ------------------------------- |
| `Intek.PcPosLibrary.PCPOS`              | `PecPcpos`, `sendTransaction()` |
| `Intek.PcPosLibrary.Response`           | `parseResponse()`, `decodeResponse()` |
| `Pec_PCPOS_WindowsService.PecPcposService` | `PecPcposFileBridge`        |
| `Intek.PcPosLibrary.PCPOS.BuildMsg()`  | `buildMessage()`                |
| `Intek.PcPosLibrary.PCPOS.sendToLan()`  | `LanTransport`                  |
| `Intek.PcPosLibrary.PCPOS.sendToSerialPort()` | `StreamTransport` (pluggable) |
| `Intek.PcPosLibrary.Response.GetBankName()` | `getBankNameByPan()` + 23-entry BIN table |

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
- [API reference](#api-reference)
  - [High-level client: `PecPcpos`](#high-level-client-pecpcpos)
  - [One-shot helper: `sendTransaction()`](#one-shot-helper-sendtransaction)
  - [Windows-Service replacement: `PecPcposFileBridge`](#windows-service-replacement-pecpcposfilebridge)
  - [Low-level: message builder](#low-level-message-builder)
  - [Low-level: response parser](#low-level-response-parser)
  - [Request-file parser](#request-file-parser)
  - [Bank-BIN lookup](#bank-bin-lookup)
  - [Transports](#transports)
  - [Encoding helpers](#encoding-helpers)
- [Wire protocol](#wire-protocol)
  - [Request message format](#request-message-format)
  - [Response message format](#response-message-format)
  - [Field tags](#field-tags)
  - [Codepages](#codepages)
- [Testing](#testing)
- [Examples](#examples)
- [Limitations / known issues](#limitations--known-issues)
- [License](#license)

## Install

```bash
npm install pec-pcpos
# or
yarn add pec-pcpos
```

The package has **zero runtime dependencies** — the cp1256 single-byte codec
is hand-rolled as a 256-entry lookup table, so you don't need iconv-lite or
full-ICU Node builds.

Peer/optional dependency: if you want to talk to a real POS over a COM port,
install [`serialport`](https://www.npmjs.com/package/serialport) yourself
and pass the resulting stream into `new StreamTransport(port)`. We don't
bundle it because (a) it's a native module with build complexity, (b) most
users connect over LAN, and (c) keeping the dep surface empty lets this
library run on stock Node installs.

## Quick start

### One-shot transaction over LAN

```ts
import { sendTransaction } from "pec-pcpos";

const resp = await sendTransaction({
  amount: "10000",         // in Rials (1000 Tomans)
  type: "LAN",
  ip: "192.168.10.20",
  port: 7020,
  prCode: "000000",        // optional, default "000000"
  currency: "364",         // optional, default "364" (Iranian Rial)
});

console.log(resp.responseCode);  // "00" = success
console.log(resp.rrn);           // Retrieval Reference Number
console.log(resp.bankName);      // "بانک سامان" (Bank Saman, in Persian)
```

### Long-lived client with events

```ts
import { PecPcpos, LanTransport } from "pec-pcpos";

const pcpos = new PecPcpos({
  ip: "192.168.10.20",
  port: 7020,
  timeoutMs: 10_000,
});

pcpos.on("connect",    () => console.log("connected"));
pcpos.on("disconnect", () => console.log("disconnected"));
pcpos.on("error",      (e) => console.error("transport error:", e));
pcpos.on("sent",       (b) => console.log(`sent ${b.length} bytes`));
pcpos.on("received",   (b) => console.log(`received ${b.length} bytes`));

const resp = await pcpos.sendTransaction({
  amount: "10000",
  type: "LAN",
});
```

### Serial port (using `serialport`)

```ts
import { SerialPort } from "serialport";
import { PecPcpos, StreamTransport } from "pec-pcpos";

const port = new SerialPort({
  path: "COM3",            // or "/dev/ttyS0", "/dev/ttyUSB0"
  baudRate: 19200,        // matches the original .NET config
  dataBits: 8,
  parity: "none",
  stopBits: 1,
  autoOpen: false,
});
await port.open();

const pcpos = new PecPcpos({ transport: new StreamTransport(port) });
const resp = await pcpos.sendTransaction({
  amount: "10000",
  type: "SERIAL",
  comPort: "COM3",         // not actually used here (the stream IS the comPort)
});
```

### Drop-in Windows-Service replacement

The original `Pec-PCPOS-WindowsService.exe` is a Windows Service that polls
`C:\Users\Public\PEC_PCPOS\request\` every 500 ms for `KEY=VALUE` request
files, sends them to the POS, and writes the parsed response back to
`C:\Users\Public\PEC_PCPOS\response\`. The `PecPcposFileBridge` class
reproduces this behaviour in pure Node.js:

```ts
import { PecPcposFileBridge } from "pec-pcpos";

const bridge = new PecPcposFileBridge({
  basePath: process.env.PEC_PCPOS_BASE_PATH ?? "C:\\Users\\Public\\PEC_PCPOS",
  pollIntervalMs: 500,
  pcpos: {
    ip: "192.168.10.20",
    port: 7020,
    timeoutMs: 10_000,
  },
});

bridge.on("file",     (file)        => console.log("processing", file));
bridge.on("sent",     (file)        => console.log("request sent for", file));
bridge.on("response", (file, resp)  => console.log(file, "→", resp.responseCode));
bridge.on("error",    (err)         => console.error(err));
bridge.on("started",  ()            => console.log("bridge started"));
bridge.on("stopped",  ()            => console.log("bridge stopped"));

bridge.start();
```

Drop a request file like this into `<basePath>/request/`:

```
AMOUNT=10000
TYPE=LAN
IP=192.168.10.20
PORT=7020
PRCODE=000000
CURRENCY=364
```

…and you'll find the response in `<basePath>/response/<same-filename>`:

```
ResponseCode = 00
TraceID = 123456
PAN = 6219860012345678
TerminalID = 01234567
Amount = 1000000
RRN = 202401010000001
DateTime = 1403/01/01 12:30:45
Date = 1403/01/01
Time = 12:30:45
SerialNumber = 0001
```

## API reference

### High-level client: `PecPcpos`

```ts
class PecPcpos extends EventEmitter {
  constructor(opts?: {
    transport?: DuplexTransport;      // pre-built transport (skips auto-construction)
    ip?: string;                      // for LAN
    port?: number;                    // for LAN
    serialStream?: DuplexStreamLike;  // for SERIAL (e.g. a serialport instance)
    timeoutMs?: number;               // default 60_000
  });

  sendTransaction(req: PcposRequestOptions): Promise<PcposResponse>;
  testConnection(req): Promise<boolean>;
  buildRequest(req: PcposRequestOptions): { body: string; bytes: Buffer };
  formatResponse(resp: PcposResponse): string;

  get lastRequest():  { body: string; bytes: Buffer } | undefined;
  get lastResponse(): PcposResponse | undefined;
}
```

**Events:** `connect`, `disconnect`, `error`, `sent` (Buffer), `received` (Buffer).

### One-shot helper: `sendTransaction()`

```ts
function sendTransaction(req: PcposRequestOptions & { timeoutMs?: number }): Promise<PcposResponse>;
```

Constructs the message, opens a transport (LAN only — serial requires the
caller to provide a stream), sends, reads, parses, closes, and returns.

### Windows-Service replacement: `PecPcposFileBridge`

```ts
class PecPcposFileBridge extends EventEmitter {
  constructor(opts?: {
    basePath?: string;            // default "C:\\Users\\Public\\PEC_PCPOS"
    requestDir?: string;          // default "request"
    responseDir?: string;         // default "response"
    pollIntervalMs?: number;      // default 500
    useFsWatch?: boolean;         // default false (polling, like the original)
    pcpos?: ConstructorParameters<typeof PecPcpos>[0];
    log?: (msg: string) => void;  // default console.log
  });

  start(): void;
  stop(): void;
  scanOnce(): Promise<string | null>;  // process at most one file
}
```

**Events:** `started`, `stopped`, `file`, `sent`, `response`, `error`.

### Low-level: message builder

```ts
function buildMessage(opts: {
  amount: string | number;
  prCode?: string;             // default "000000"
  currency?: string;           // default "364"
  cardholderReceipt?: string;  // R1 wire tag
  merchantReceipt?: string;    // R2 wire tag
  cardholderTitle?: string;    // T1 wire tag
  merchantTitle?: string;      // T2 wire tag
  service?: string;            // SV wire tag
  serviceGroup?: string;       // SG wire tag
  settlement?: Array<{ account: string; amount: string | number }>;  // ST sub-blocks
  keyValue?: Array<{ key: string; value: string }>;  // AV+PV sub-blocks
}): { body: string; bytes: Buffer };

function fillMsgTags(opts): MsgTags;  // expose the tag dict for inspection
```

### Low-level: response parser

```ts
function parseResponse(rawResponse: string): PcposResponse;
function decodeResponse(bytes: Buffer | Uint8Array, start?: number, end?: number): PcposResponse;
function formatParsedResponse(rawResponse: string): string;  // multi-line "Label = value" form

// Individual tag getters (return bare values without label prefixes):
function getResponseCode(raw: string): string;   // RC tag, always 2 chars
function getTraceId(raw: string): string;       // TR tag
function getPan(raw: string): string;           // PN tag
function getTerminalId(raw: string): string;    // TM tag
function getAmount(raw: string): string;        // AM tag
function getRrn(raw: string): string;            // RN tag
function getDateTime(raw: string): string;       // TI tag (full)
function getDate(raw: string): string;           // TI tag (date portion, 10 chars)
function getTime(raw: string): string;          // TI tag (time portion, 8 chars)
function getSerialNumber(raw: string): string;   // SR tag
function getBankName(raw: string): string;       // bank name from PAN BIN lookup
function getBankBin(respSuccess: string): string; // "PAN = " + first 6 digits
function getTagValue(raw: string, tag: string): string;  // generic extractor
```

### Request-file parser

```ts
function parseRequestFile(contents: string): PcposRequestOptions;
function parseRequestFileFromPath(filePath: string): Promise<PcposRequestOptions>;
function parseLine(line: string): [string, string] | null;  // splits on first "="
function parseKvList(raw: string): Array<{ key: string; value: string }>;
```

The parser reproduces the original's error strings **exactly** — useful if
your downstream code matches on them:

| Condition                                 | Error message                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `AMOUNT` missing                          | `"Amount must be specified. for example Amount=1000"`                                                  |
| `AMOUNT` not a non-negative integer       | `"Amount has not valid value."`                                                                        |
| `TYPE` missing                            | `"Type is not specified. Use LAN or SERIAL as type.\r\n for example type=LAN"`                        |
| `TYPE` not LAN/SERIAL                     | `"Type is not valid. Use LAN or SERIAL only.\r\n for example type=LAN"`                                |
| `TYPE=LAN` and `IP` missing               | `"port is not specified. Use POS LAN Ip.\r\n for example ip=192.168.10.20"` (yes, the original says "port" here) |
| `TYPE=LAN` and `PORT` missing              | `"port is not specified. Use POS LAN port number.\r\n for example port=7020"`                         |
| `TYPE=LAN` and `PORT` out of range         | `"Port has not valid value. a port number must be between 1 to 65535"`                                 |
| `TYPE=SERIAL` and `COMPORT` missing        | `"com port is not specified. Use SERIAL port number.\r\n for example comport=COM3"`                   |

### Bank-BIN lookup

```ts
const BANK_BINS: ReadonlyArray<{ bin: string; name: string }>;  // 23 entries

function getBankNameByPan(pan: string | null | undefined): string;
function getBankNameByBin(bin: string): string;
```

The 23 Iranian bank BINs covered (with their Persian names as extracted
from the original .NET #US heap):

| BIN     | Bank (Persian)          | Transliteration          |
| ------- | ----------------------- | ------------------------ |
| 621986  | بانک سامان              | Bank Saman               |
| 622106  | بانک پارسیان            | Bank Parsian             |
| 603799  | بانک ملی                | Bank Melli               |
| 589210  | بانک سپه                | Bank Sepah               |
| 627648  | بانک توسعه صادرات       | Bank Tose'e Saderat     |
| 628023  | بانک مسکن               | Bank Maskan              |
| 603770  | بانک کشاورزی            | Bank Keshavarzi          |
| 627961  | بانک صنعت و معدن        | Bank San'at o Ma'dan     |
| 627760  | پست بانک                | Post Bank                |
| 502908  | توسعه تعاون             | Tose'e Ta'avon           |
| 627412  | اقتصاد نوین             | Eghtesad Novin           |
| 639347  | بانک پاسارگاد           | Bank Pasargad            |
| 627488  | بانک کارآفرین           | Bank Karafarin           |
| 639346  | بانک سینا               | Bank Sina                |
| 639607  | بانک سرمایه             | Bank Sarmayeh            |
| 502806  | بانک شهر                | Bank Shahr               |
| 603769  | بانک صادرات             | Bank Saderat             |
| 610433  | بانک ملت                | Bank Mellat              |
| 627353  | بانک تجارت              | Bank Tejarat             |
| 589463  | بانک رفاه               | Bank Refah               |
| 627381  | بانک انصار              | Bank Ansar               |
| 502938  | بانک دی                 | Bank Day                 |
| 505801  | بانک کوثر               | Bank Kowsar              |

### Transports

```ts
class LanTransport extends EventEmitter implements DuplexTransport {
  constructor(ip: string, port: number, timeoutMs?: number);
  connect(): Promise<void>;
  write(data: Buffer): Promise<void>;
  read(maxLen?: number): Promise<Buffer>;
  readExisting(): Promise<Buffer>;
  close(): void;
  get connected(): boolean;
}

class StreamTransport extends EventEmitter implements DuplexTransport {
  constructor(stream: DuplexStreamLike, alreadyOpen?: boolean);
  write(data: Buffer): Promise<void>;
  read(maxLen: number): Promise<Buffer>;
  readExisting(): Promise<Buffer>;
  close(): void;
  get connected(): boolean;
}

interface DuplexStreamLike {
  write(data: Buffer, cb?: (err?: Error | null) => void): boolean;
  on(event: "data" | "close" | "error", listener: (...args: any[]) => void): this;
  // ... (any Node.js-style duplex stream)
}
```

### Encoding helpers

```ts
function encodeCp1256(s: string): Buffer;     // JS string → cp1256 bytes
function decodeCp1256(bytes: Uint8Array | Buffer, start?: number, end?: number): string;
```

The protocol uses Windows-1256 (Arabic codepage) for the request bytes
and the response bytes. Node's `Buffer` doesn't support cp1256 natively
(requires full-ICU build), so we hand-roll a 256-entry lookup table —
zero dependencies, byte-for-byte compatible with .NET's
`Encoding.GetEncoding(1256)`.

## Wire protocol

### Request message format

```
+----------------+----------------+-----------------+
| 4-digit ASCII  | "RQ" + 3-digit | tag block       |
| decimal length | ASCII length   | (see below)     |
| prefix         | of tag block   |                 |
+----------------+----------------+-----------------+
```

Within the tag block, each field is encoded as:

```
[2-char tag][3-digit ASCII decimal length][value bytes]
```

The tag block is emitted in **strict insertion order** (matching the
.NET `Dictionary<string,string>` iteration order in `fillMsgParams`):

| Order | Tag | Source property           | Wire tag key | Notes                |
| ----- | --- | ------------------------- | ------------ | -------------------- |
| 1     | PR  | `PrCode`                  | `PR`         | default `"000000"`   |
| 2     | AM  | `Amount`                  | `AM`         | required             |
| 3     | CU  | `Currency`                | `CU`         | default `"364"`      |
| 4     | R1  | `R1Holder` (cardholder)   | `R1`         | skipped if empty     |
| 5     | R2  | `R2Merchant`              | `R2`         | skipped if empty     |
| 6     | T1  | `T1Holder` (cardholder)   | `T1`         | skipped if empty     |
| 7     | T2  | `T2Merchant`              | `T2`         | skipped if empty     |
| 8     | SV  | `Service`                 | `SV`         | skipped if empty     |
| 9     | SG  | `ServiceGroup`            | `SG`         | skipped if empty     |
| 10    | AD  | (always empty)            | `AD`         | always skipped      |
| 11    | PD  | (constant `"1"`)          | `PD`         | always present       |

After the base block, two optional sub-blocks may be appended:

**Settlement** (one `ST` sub-block per `account=amount` pair):

```
sub = "AC" + len(account).padStart(3,'0') + account
    + "AM" + len(amount).padStart(3,'0')  + amount
body += "ST" + len(sub).padStart(3,'0') + sub
```

**KeyValue** (one `AV` + one `PV` per `key=value` pair — yes, the same
sub is emitted twice; this is faithful to the original .NET behaviour,
which appears to be a bug in the original library but is preserved here
for wire-level compatibility):

```
sub = "KY" + len(key).padStart(3,'0') + key
    + "VL" + len(value).padStart(3,'0') + value
body += "AV" + len(sub).padStart(3,'0') + sub
body += "PV" + len(sub).padStart(3,'0') + sub
```

**Total length prefix**: After all tags and sub-blocks are assembled, the
body is prepended with `"RQ" + bodyLength.padStart(3,'0')`. Then the
final byte stream is `cp1256(bodyLength.padStart(4,'0') + body)`.

### Response message format

The response uses the same length-prefixed structure as the request:

```
[4-digit ASCII length prefix]
["RQ" + 3-digit body length]
[RC + 3-digit length + 2-char response code]
[TR + 3-digit length + trace ID]
[PN + 3-digit length + PAN]
[TM + 3-digit length + terminal ID]
[AM + 3-digit length + amount]
[RN + 3-digit length + RRN]
[TI + 3-digit length + date-time]
[SR + 3-digit length + serial]
```

The response code is **always at byte offset 14** of the raw response —
the parser hard-codes this assumption (matching `Response.GetTrxnResp()`
in the original).

The `TI` (date-time) value is parsed into separate date (10 chars) and
time (8 chars) fields by taking substrings at fixed offsets:
- `Date = rawResponse.Substring(IndexOf("TI") + 5, 10)`
- `Time = rawResponse.Substring(IndexOf("TI") + 5 + 10 + 1, 8)`

So the expected format is: `<10-char date><1-char separator><8-char time>`
(e.g. `"1403/01/01 12:30:45"` for a Persian-calendar date).

### Field tags

| Tag | Meaning                          | Direction |
| --- | -------------------------------- | ---------- |
| PR  | Processing code                  | Request   |
| AM  | Amount (in Rials)                | Both      |
| CU  | Currency (ISO 4217 numeric)      | Request   |
| R1  | Cardholder receipt body         | Request   |
| R2  | Merchant receipt body           | Request   |
| T1  | Cardholder title                | Request   |
| T2  | Merchant title                  | Request   |
| SV  | Service identifier              | Request   |
| SG  | Service group                    | Request   |
| AD  | (always empty in original)      | Request   |
| PD  | (constant `"1"`)                | Request   |
| AC  | Settlement account              | Request (in ST) |
| ST  | Settlement sub-block wrapper    | Request   |
| KY  | KeyValue key                    | Request (in AV/PV) |
| VL  | KeyValue value                  | Request (in AV/PV) |
| AV  | KeyValue sub-block wrapper     | Request   |
| PV  | KeyValue sub-block wrapper (duplicate) | Request |
| RQ  | Request header                  | Both      |
| RC  | Response code                   | Response  |
| TR  | Trace ID                        | Response  |
| PN  | PAN (Primary Account Number)    | Response  |
| TM  | Terminal ID                     | Response  |
| RN  | RRN (Retrieval Reference Number) | Response  |
| TI  | Transaction date-time           | Response  |
| SR  | Serial number                   | Response  |

### Codepages

| Path        | Original .NET call                          | This package |
| ----------- | -------------------------------------------- | ------------ |
| Request encoding | `Encoding.GetEncoding(1256).GetBytes(...)` | `encodeCp1256()` |
| LAN response decoding | `Encoding.get_ASCII().GetString(...)` | `Buffer.toString('ascii')` * (we use cp1256 for better fidelity) |
| Serial response decoding | `Encoding.get_UTF8().GetString(...)` | `decodeCp1256()` * |

\* The original .NET library uses ASCII to decode the LAN response and
UTF-8 to decode the serial response — both inconsistent with the cp1256
used to encode the request. We use cp1256 throughout, which is a superset
of ASCII for all response fields actually used (response code, trace,
terminal, amount, RRN, date, time, serial are all ASCII; the PAN's first
6 digits are ASCII even when the rest of the PAN contains Persian chars).
This is more lenient than the original — wire-format-identical for valid
responses, slightly more graceful for unusual ones.

## Testing

The library ships with **75 unit tests** covering:

- `tests/message.test.ts`     — message builder, cp1256 round-trips (29 tests)
- `tests/response.test.ts`    — response parser, all `GetXXX()` methods (27 tests)
- `tests/bins.test.ts`         — bank BIN lookup table (15 tests)
- `tests/file-parser.test.ts`  — request-file parser, incl. exact error messages (4 tests, several sub-tests)

```bash
npm test
```

There is also an end-to-end test using a mock POS TCP server in
`examples/mock-server.js` and `examples/send-test.js`:

```bash
# Terminal 1
node examples/mock-server.js 7020

# Terminal 2
node examples/send-test.js 127.0.0.1 7020
```

## Examples

- [`examples/mock-server.js`](./examples/mock-server.js) — A fake POS TCP
  server that responds to a transaction request with a synthetic
  response containing a Bank Saman BIN. Useful for end-to-end testing
  without real POS hardware.
- [`examples/send-test.js`](./examples/send-test.js) — A one-shot client
  that sends a transaction to a POS at a given IP:port and prints the
  parsed response.

## Limitations / known issues

1. **`fs.watch` unreliability**: The original Windows Service polls every
   500 ms. We default to polling for parity. Setting `useFsWatch: true`
   on `PecPcposFileBridge` adds a low-latency `fs.watch` listener on top
   of the poller (it doesn't replace polling) for faster file detection.

2. **`fs.watch` cannot watch network drives reliably**: If your
   `basePath` lives on a network share, keep `useFsWatch: false`.

3. **Serial port requires `serialport` package**: We don't bundle
   `serialport` because it's a native module. Install it yourself and
   pass the open port into `new StreamTransport(port)`.

4. **`KeyValue` AV/PV duplication**: The original .NET `BuildMsg()`
   method emits the same `KY/VL` sub-block twice — once wrapped in `AV`
   and again wrapped in `PV`. This is reproduced faithfully here. If your
   real-world POS rejects the `PV` block as a duplicate, you can
   suppress it by post-processing the `bytes` returned from
   `buildMessage()` to strip the `PV<len><sub>` segments.

5. **`AD` empty tag**: The original always populates `Msg_Tags["AD"] = ""`
   in `fillMsgParams`, but `BuildMsg` skips it because of the
   `IsNullOrEmpty(value)` check. We faithfully reproduce this — `AD`
   never appears on the wire.

6. **Test fixture for `TI` value**: The .NET parser expects
   `Date(10) + sep(1) + Time(8) = 19 chars` for the `TI` tag value.
   If your POS sends a shorter value (e.g. `14030101 12:30:45` is 17
   chars), the `date` and `time` fields will be misaligned. This is
   faithful to the original behaviour — your POS MUST send a 19-char
   `TI` value for the date/time extraction to work.

7. **No connection pooling**: Each `sendTransaction()` call from a
   `PecPcpos` configured for LAN opens a fresh TCP connection (matching
   the original `new TcpClient(ip, port)` in `sendToLan`). For
   high-throughput scenarios, share a long-lived `LanTransport`
   instance via the `transport` option.

## License

MIT — see [`LICENSE`](./LICENSE).

The reverse-engineering work was performed on a binary that is
Copyright © 2017 (the original author's name was not embedded in the
file metadata). The wire protocol itself is not copyrightable; this
reimplementation contains no original source code from the .NET
assembly, only a behavioural port derived from the disassembled IL.
