import { EventEmitter } from "events";
import { PecPcpos } from "./pcpos";
export interface FileBridgeOptions {
    /**
     * Base directory containing the `request/` and `response/` subdirs.
     * Default: `C:\Users\Public\PEC_PCPOS` (matches original).
     */
    basePath?: string;
    /** Override the request subdirectory name. Default `request`. */
    requestDir?: string;
    /** Override the response subdirectory name. Default `response`. */
    responseDir?: string;
    /** Polling interval (ms). Default 500 (matches the original Timer). */
    pollIntervalMs?: number;
    /** PCPOS client options (transport, ip/port/serialStream, timeout). */
    pcpos?: ConstructorParameters<typeof PecPcpos>[0];
    /**
     * Set to `true` to use `fs.watch` instead of polling. Default `false`
     * (polling) for parity with the original service's behaviour.
     */
    useFsWatch?: boolean;
    /**
     * Optional logger function. Default `console.log`.
     * Set to `() => {}` for silent operation.
     */
    log?: (msg: string) => void;
}
/**
 * The file-bridge service. Start it with `.start()` and stop with `.stop()`.
 *
 * Events (EventEmitter):
 *   - `started`   — bridge started watching the request directory
 *   - `file`      — a request file was detected (emitted with the file
 *                   path before processing begins)
 *   - `sent`      — request successfully sent to the POS
 *   - `response`  — response file successfully written (emitted with
 *                   the response file path + parsed response)
 *   - `error`    — an error occurred processing a file (the file's
 *                   response file is still written with the error
 *                   message before this event fires)
 *   - `stopped`   — bridge stopped
 */
export declare class PecPcposFileBridge extends EventEmitter {
    private readonly basePath;
    private readonly requestDir;
    private readonly responseDir;
    private readonly pollIntervalMs;
    private readonly useFsWatch;
    private readonly log;
    private readonly pcpos;
    private timer;
    private fsWatcher;
    private running;
    private processing;
    constructor(opts?: FileBridgeOptions);
    /**
     * Start watching the request directory.
     *
     * Returns immediately (does not block). Use the `started` event to
     * know when the watcher is fully up.
     */
    start(): void;
    /**
     * Stop watching. Safe to call multiple times.
     */
    stop(): void;
    /**
     * Do a single scan of the request directory and process the first
     * file found (if any). Returns the processed filename or `null`.
     *
     * The original .NET service processes only one file per timer tick.
     * We preserve that behaviour to avoid overloading the POS.
     */
    scanOnce(): Promise<string | null>;
    /**
     * Process a single request file.
     *
     * 1. Read all lines (UTF-8).
     * 2. Delete the file immediately.
     * 3. Parse the contents into a PcposRequestOptions.
     * 4. Send via PecPcpos.
     * 5. Write the response to the response directory (same filename).
     * 6. On error, write the error message + original file content
     *    to the response file (matches the original catch block).
     */
    private processFile;
    private responsePathFor;
}
