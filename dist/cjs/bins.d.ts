/**
 * Iranian bank BIN lookup table — straight port of the
 * `Response.GetBankName()` switch in the original `Intek.PcPosLibrary`.
 *
 * Each BIN is the first 6 digits of the PAN (Primary Account Number).
 * Each bank name is the original UTF-16 Persian string, reproduced here
 * as the equivalent JS string.
 *
 * Source: extracted from the .NET #US (User Strings) heap. See
 * /home/z/my-project/scripts/decode_bins.py for the extraction tool.
 */
export declare const BANK_BINS: ReadonlyArray<{
    bin: string;
    name: string;
}>;
/**
 * Look up the Persian bank name for a given PAN.
 *
 * Behaviour matches `Response.GetBankName()` exactly:
 * - If the PAN is `undefined`/`null`/`""` → returns `""`.
 * - If the PAN starts with a known 6-digit BIN → returns the bank name.
 * - Otherwise → returns `""`.
 *
 * The PAN passed in is the *full* PAN string (e.g. `"62198612...1234"`),
 * not just the first 6 digits. We match on the prefix only.
 *
 * @param pan the full PAN string, or `null`/`undefined`
 * @returns the Persian bank name, or `""` if no match
 */
export declare function getBankNameByPan(pan: string | null | undefined): string;
/**
 * Look up the Persian bank name for a 6-digit BIN prefix.
 *
 * This is a convenience wrapper around `getBankNameByPan` for the case
 * where the caller already has just the BIN (e.g. they only stored the
 * first 6 digits for privacy reasons).
 */
export declare function getBankNameByBin(bin: string): string;
