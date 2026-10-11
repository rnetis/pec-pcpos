/**
 * Directory-watcher bridge — a drop-in replacement for the original
 * `Pec_PCPOS_WindowsService` Windows Service.
 *
 * The original .NET service:
 *   - Polls `C:\Users\Public\PEC_PCPOS\request\` every 500 ms for files.
 *   - For each file (alphabetically first one wins):
 *       1. Read all lines (UTF-8).
 *       2. Delete the file immediately (so it isn't processed twice).
 *       3. Parse the lines into a `KEY=VALUE` dictionary.
 *       4. Construct a PCPOS, populate from the dict, call `send_transaction()`.
 *       5. On success: write `Response.GetParsedResp()` to the same
 *          filename under the `\response\` directory.
 *       6. On error: write `ex.Message + "\r\n" + "\r\n" + Join("\r\n", lines)`
 *          to the same destination file.
 *
 * This module replicates that behaviour in pure Node.js. It uses
 * `fs.watch` for low-latency file notifications (more efficient than
 * 500 ms polling), but falls back to polling when `fs.watch` is
 * unavailable or unreliable.
 */
import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";
import { PecPcpos } from "./pcpos";
import { parseRequestFile } from "./file-parser";
import { formatParsedResponse } from "./response";
const DEFAULT_BASE_PATH = "C:\\Users\\Public\\PEC_PCPOS";
const DEFAULT_POLL_INTERVAL_MS = 500; // matches the original .NET Timer
const DEFAULT_ENCODING = "utf8";
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
export class PecPcposFileBridge extends EventEmitter {
    constructor(opts = {}) {
        var _a, _b, _c, _d, _e, _f, _g;
        super();
        this.timer = null;
        this.fsWatcher = null;
        this.running = false;
        this.processing = false;
        this.basePath = (_a = opts.basePath) !== null && _a !== void 0 ? _a : DEFAULT_BASE_PATH;
        this.requestDir = path.join(this.basePath, (_b = opts.requestDir) !== null && _b !== void 0 ? _b : "request");
        this.responseDir = path.join(this.basePath, (_c = opts.responseDir) !== null && _c !== void 0 ? _c : "response");
        this.pollIntervalMs = (_d = opts.pollIntervalMs) !== null && _d !== void 0 ? _d : DEFAULT_POLL_INTERVAL_MS;
        this.useFsWatch = (_e = opts.useFsWatch) !== null && _e !== void 0 ? _e : false;
        this.log = (_f = opts.log) !== null && _f !== void 0 ? _f : ((msg) => console.log(msg));
        this.pcpos = new PecPcpos((_g = opts.pcpos) !== null && _g !== void 0 ? _g : {});
    }
    /**
     * Start watching the request directory.
     *
     * Returns immediately (does not block). Use the `started` event to
     * know when the watcher is fully up.
     */
    start() {
        if (this.running)
            return;
        this.running = true;
        // Ensure directories exist (matches original OnStart behaviour).
        for (const dir of [this.basePath, this.requestDir, this.responseDir]) {
            try {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            }
            catch (err) {
                // The original prints the message and falls back to default_path.
                this.log(`Failed to create ${dir}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        if (this.useFsWatch) {
            try {
                this.fsWatcher = fs.watch(this.requestDir, (eventType, filename) => {
                    if (eventType === "rename" && filename) {
                        // A file was added/removed. Schedule a scan on next tick to
                        // let the file system settle.
                        setImmediate(() => this.scanOnce());
                    }
                });
            }
            catch (err) {
                this.log(`fs.watch failed, falling back to polling: ${err instanceof Error ? err.message : String(err)}`);
                this.fsWatcher = null;
            }
        }
        // Always also poll — `fs.watch` is unreliable across platforms
        // (especially on Windows network drives), so we use it as a
        // low-latency hint and fall back to polling for correctness.
        this.timer = setInterval(() => {
            this.scanOnce().catch((err) => {
                this.emit("error", err);
            });
        }, this.pollIntervalMs);
        this.emit("started");
    }
    /**
     * Stop watching. Safe to call multiple times.
     */
    stop() {
        this.running = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.fsWatcher) {
            this.fsWatcher.close();
            this.fsWatcher = null;
        }
        this.emit("stopped");
    }
    /**
     * Do a single scan of the request directory and process the first
     * file found (if any). Returns the processed filename or `null`.
     *
     * The original .NET service processes only one file per timer tick.
     * We preserve that behaviour to avoid overloading the POS.
     */
    async scanOnce() {
        if (this.processing)
            return null; // re-entrancy guard
        this.processing = true;
        try {
            const files = await listFilesSafe(this.requestDir);
            if (files.length === 0)
                return null;
            // The original takes files[0] (Directory.GetFiles returns them
            // in some unspecified order; on .NET/Windows it's typically
            // alphabetical). We sort alphabetically for determinism.
            files.sort();
            const file = files[0];
            if (!fs.existsSync(file))
                return null;
            this.emit("file", file);
            await this.processFile(file);
            return file;
        }
        finally {
            this.processing = false;
        }
    }
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
    async processFile(filePath) {
        // Read file contents (UTF-8).
        let contents;
        try {
            contents = await fs.promises.readFile(filePath, DEFAULT_ENCODING);
        }
        catch (err) {
            this.emit("error", err);
            return;
        }
        // Delete the file immediately (matches original OnTimer behaviour).
        try {
            await fs.promises.unlink(filePath);
        }
        catch (err) {
            // If the file was already gone, that's fine.
            if (err.code !== "ENOENT") {
                this.emit("error", err);
            }
        }
        let responseText;
        try {
            const opts = parseRequestFile(contents);
            const resp = await this.pcpos.sendTransaction(opts);
            responseText = formatParsedResponse(resp.rawResponse);
            this.emit("sent", filePath);
            this.emit("response", this.responsePathFor(filePath), resp);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Original C# catch: ex.Message + "\r\n" + "\r\n" + Join("\r\n", lines)
            // Concat(string, string, string) joins the three args. So the format is:
            //   "<msg>\r\n\r\n<file contents>"
            // (the second \r\n is the literal "\r\n" prefix of the original
            // contents joined back together)
            responseText = `${msg}\r\n\r\n${contents}`;
            this.emit("error", err);
        }
        // Write the response file to <responseDir>/<basename-of-filepath>.
        const responsePath = this.responsePathFor(filePath);
        try {
            await fs.promises.writeFile(responsePath, responseText, DEFAULT_ENCODING);
        }
        catch (err) {
            this.emit("error", err);
        }
    }
    responsePathFor(requestFilePath) {
        // Original C#:
        //   dir_path_resp + filename.Substring(filename.LastIndexOf("\\"))
        // i.e. strip everything up to and including the last backslash,
        // keep the trailing path-separator + basename.
        const lastSep = requestFilePath.lastIndexOf(path.sep);
        const basename = requestFilePath.substring(lastSep); // includes sep
        return this.responseDir + basename;
    }
}
/**
 * List files in a directory, returning an empty array if the directory
 * doesn't exist (instead of throwing).
 */
async function listFilesSafe(dir) {
    try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        return entries
            .filter((e) => e.isFile())
            .map((e) => path.join(dir, e.name));
    }
    catch (err) {
        if (err.code === "ENOENT")
            return [];
        throw err;
    }
}
//# sourceMappingURL=file-bridge.js.map