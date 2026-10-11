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
export const BANK_BINS = [
    { bin: "621986", name: "بانک سامان" },
    { bin: "622106", name: "بانک پارسیان" },
    { bin: "603799", name: "بانک ملی" },
    { bin: "589210", name: "بانک سپه" },
    { bin: "627648", name: "بانک توسعه صادرات" },
    { bin: "628023", name: "بانک مسکن" },
    { bin: "603770", name: "بانک کشاورزی" },
    { bin: "627961", name: "بانک صنعت و معدن" },
    { bin: "627760", name: " پست بانک" },
    { bin: "502908", name: "توسعه تعاون" },
    { bin: "627412", name: "اقتصاد نوین" },
    { bin: "639347", name: "بانک پاسارگاد" },
    { bin: "627488", name: "بانک کارآفرین" },
    { bin: "639346", name: "بانک سینا" },
    { bin: "639607", name: "بانک سرمایه" },
    { bin: "502806", name: "بانک شهر" },
    { bin: "603769", name: "بانک صادرات" },
    { bin: "610433", name: "بانک ملت" },
    { bin: "627353", name: "بانک تجارت" },
    { bin: "589463", name: "بانک رفاه" },
    { bin: "627381", name: "بانک انصار" },
    { bin: "502938", name: "بانک دی" },
    { bin: "505801", name: "بانک کوثر" },
];
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
export function getBankNameByPan(pan) {
    if (!pan || pan.length < 6)
        return "";
    const prefix = pan.substring(0, 6);
    for (const entry of BANK_BINS) {
        if (entry.bin === prefix) {
            return entry.name;
        }
    }
    return "";
}
/**
 * Look up the Persian bank name for a 6-digit BIN prefix.
 *
 * This is a convenience wrapper around `getBankNameByPan` for the case
 * where the caller already has just the BIN (e.g. they only stored the
 * first 6 digits for privacy reasons).
 */
export function getBankNameByBin(bin) {
    if (!bin || bin.length < 6)
        return "";
    return getBankNameByPan(bin.substring(0, 6));
}
//# sourceMappingURL=bins.js.map