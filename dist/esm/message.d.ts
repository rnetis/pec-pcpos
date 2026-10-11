import { type MsgTags } from "./types";
/**
 * Build the `Msg_Tags` dictionary for a transaction, mirroring the
 * exact insertion order of `fillMsgParams()`.
 *
 * NOTE: the original C# code populates ALL fields including empty ones
 * (e.g. `AD` → `""`); the empty fields are then filtered out in
 * `BuildMsg()`. We preserve that two-step behaviour here for clarity.
 *
 * @param opts the user-supplied options. Defaults applied:
 *   - `prCode`   → `"000000"` (matches the PCPOS ctor)
 *   - `currency` → `"364"`    (matches the PCPOS ctor; 364 = Iranian Rial)
 *   - All receipt/title strings → `""` if not specified
 */
export declare function fillMsgTags(opts: {
    prCode?: string;
    amount: string | number;
    currency?: string;
    cardholderReceipt?: string;
    merchantReceipt?: string;
    cardholderTitle?: string;
    merchantTitle?: string;
    service?: string;
    serviceGroup?: string;
}): MsgTags;
/**
 * Build the final wire message for a transaction.
 *
 * This is the JS equivalent of `PCPOS.BuildMsg()` (without the `set_Request`
 * and `Console.WriteLine` side effects — those are exposed via the returned
 * `body` field for callers that want to log it).
 *
 * @param opts see `PcposRequestOptions` for field semantics. At minimum,
 *            `amount` must be provided.
 *
 * @returns an object with:
 *   - `body`: the full body string starting with `RQ<3-digit-len>` ...
 *   - `bytes`: Buffer of `[4-digit-length][body]` cp1256-encoded
 *
 * @throws if `amount` is not a valid unsigned integer
 */
export declare function buildMessage(opts: {
    amount: string | number;
    prCode?: string;
    currency?: string;
    cardholderReceipt?: string;
    merchantReceipt?: string;
    cardholderTitle?: string;
    merchantTitle?: string;
    service?: string;
    serviceGroup?: string;
    settlement?: Array<{
        account: string;
        amount: string | number;
    }>;
    keyValue?: Array<{
        key: string;
        value: string;
    }>;
}): {
    body: string;
    bytes: Buffer;
};
