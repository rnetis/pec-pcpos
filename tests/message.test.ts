import { buildMessage, fillMsgTags } from "../src/message";
import { encodeCp1256, decodeCp1256 } from "../src/encoding";

describe("message builder", () => {
  describe("fillMsgTags", () => {
    it("applies the same defaults as the .NET PCPOS ctor (Currency=364, PrCode=000000)", () => {
      const tags = fillMsgTags({ amount: "1000" });
      expect(tags.PR).toBe("000000");
      expect(tags.CU).toBe("364");
      expect(tags.AM).toBe("1000");
      expect(tags.PD).toBe("1");
      expect(tags.AD).toBe("");
      expect(tags.R1).toBe("");
      expect(tags.R2).toBe("");
      expect(tags.T1).toBe("");
      expect(tags.T2).toBe("");
      expect(tags.SV).toBe("");
      expect(tags.SG).toBe("");
    });

    it("preserves caller-supplied overrides", () => {
      const tags = fillMsgTags({
        amount: "5000",
        prCode: "001000",
        currency: "840",
        cardholderReceipt: "Cardholder receipt body",
        merchantReceipt: "Merchant receipt body",
        cardholderTitle: "Cardholder",
        merchantTitle: "Merchant",
        service: "BILLPAY",
        serviceGroup: "UTILITIES",
      });
      expect(tags.PR).toBe("001000");
      expect(tags.CU).toBe("840");
      expect(tags.AM).toBe("5000");
      expect(tags.R1).toBe("Cardholder receipt body");
      expect(tags.R2).toBe("Merchant receipt body");
      expect(tags.T1).toBe("Cardholder");
      expect(tags.T2).toBe("Merchant");
      expect(tags.SV).toBe("BILLPAY");
      expect(tags.SG).toBe("UTILITIES");
    });

    it("coerces numeric amounts to strings", () => {
      const tags = fillMsgTags({ amount: 12345 });
      expect(tags.AM).toBe("12345");
    });
  });

  describe("buildMessage", () => {
    it("builds a minimal request with the correct tag order and length-prefixed fields", () => {
      const { body, bytes } = buildMessage({ amount: "1000" });
      // body should start with RQ + 3-digit body length
      expect(body.substring(0, 2)).toBe("RQ");
      const bodyLenField = body.substring(2, 5);
      const bodyLen = parseInt(bodyLenField, 10);
      expect(body.length).toBe(5 + bodyLen);
      // Body contains PR (PrCode=000000, len 6 → "006")
      //                     AM (Amount=1000, len 4 → "004")
      //                     CU (Currency=364, len 3 → "003")
      //                     PD ("1", len 1 → "001")
      // Skipping RQ + length prefix → tag block starts at offset 5.
      const tagBlock = body.substring(5);
      expect(tagBlock).toContain("PR006000000");
      expect(tagBlock).toContain("AM0041000");
      expect(tagBlock).toContain("CU003364");
      expect(tagBlock).toContain("PD0011");
      // AD is empty → must NOT appear in the body
      expect(tagBlock).not.toContain("AD");
      // Bytes = cp1256(prefix(4) + body)
      const expectedPrefix = String(body.length).padStart(4, "0");
      expect(bytes.toString("latin1")).toBe(expectedPrefix + body);
    });

    it("encodes the body with cp1256, NOT utf-8 — so non-ASCII chars become single bytes", () => {
      // Persian character ب is 0x0628 in Unicode → 0xC8 in cp1256.
      // The .NET library uses Encoding.GetEncoding(1256).GetBytes(...).
      // We must produce the same single byte, not the 2-byte UTF-8 sequence.
      const { bytes } = buildMessage({
        amount: "1000",
        cardholderReceipt: "ب",
      });
      // Find the R1 tag in the body.
      const r1Idx = bytes.indexOf("R1", 4); // skip 4-byte length prefix
      expect(r1Idx).toBeGreaterThan(-1);
      // R1 + "001" (3-digit length) + value byte.
      // After "R1" comes 3 length chars "001", then the single cp1256 byte
      // for ب which is 0xC8.
      const valueByte = bytes[r1Idx + 5];
      expect(valueByte).toBe(0xc8);
    });

    it("emits an ST sub-block for each settlement pair", () => {
      const { body } = buildMessage({
        amount: "1000",
        settlement: [
          { account: "AC1", amount: "1000" },
          { account: "AC2", amount: "2000" },
        ],
      });
      const tagBlock = body.substring(5);
      // For each pair:
      //   sub = "AC" + "003" + account + "AM" + "004" + amount
      //   body += "ST" + len(sub,3) + sub
      const expectedSub1 = "AC003AC1" + "AM0041000";
      const expectedSt1 =
        "ST" + String(expectedSub1.length).padStart(3, "0") + expectedSub1;
      const expectedSub2 = "AC003AC2" + "AM0042000";
      const expectedSt2 =
        "ST" + String(expectedSub2.length).padStart(3, "0") + expectedSub2;
      expect(tagBlock).toContain(expectedSt1);
      expect(tagBlock).toContain(expectedSt2);
    });

    it("emits AV and PV sub-blocks for each KeyValue pair (the same sub twice — faithful to the original bug)", () => {
      const { body } = buildMessage({
        amount: "1000",
        keyValue: [{ key: "FOO", value: "BAR" }],
      });
      const tagBlock = body.substring(5);
      const sub = "KY003FOO" + "VL003BAR";
      const expectedAv =
        "AV" + String(sub.length).padStart(3, "0") + sub;
      const expectedPv =
        "PV" + String(sub.length).padStart(3, "0") + sub;
      expect(tagBlock).toContain(expectedAv);
      expect(tagBlock).toContain(expectedPv);
    });

    it("skips empty optional fields", () => {
      const { body } = buildMessage({
        amount: "1000",
        cardholderReceipt: "",
        merchantReceipt: "",
        service: "",
      });
      const tagBlock = body.substring(5);
      expect(tagBlock).not.toContain("R1");
      expect(tagBlock).not.toContain("R2");
      expect(tagBlock).not.toContain("SV");
    });

    it("produces a 4-digit ASCII decimal length prefix matching body.length", () => {
      const { body, bytes } = buildMessage({ amount: "1000" });
      const prefixStr = bytes.subarray(0, 4).toString("ascii");
      const prefix = parseInt(prefixStr, 10);
      expect(prefix).toBe(body.length);
      // 4-digit zero-padded
      expect(prefixStr.length).toBe(4);
      expect(prefixStr).toMatch(/^\d{4}$/);
    });
  });
});

describe("encoding (cp1256 round-trip)", () => {
  it("decodes back the same bytes we encoded (round-trip)", () => {
    const original = "PR006000000" + "AM0041000" + "CU003364" + "PD0011";
    const encoded = encodeCp1256(original);
    const decoded = decodeCp1256(encoded);
    expect(decoded).toBe(original);
  });

  it("decodes Persian characters using the cp1256 single-byte table", () => {
    // بانک (bank) in Persian: ب(0x0628) ا(0x0627) ن(0x0646) ک(0x06A9)
    // cp1256 bytes: 0xC8 (ب), 0xC7 (ا), 0xE4 (ن), 0x98 (ک)
    const persian = "بانک";
    const encoded = encodeCp1256(persian);
    expect(encoded.length).toBe(persian.length); // single-byte
    expect(Array.from(encoded)).toEqual([0xc8, 0xc7, 0xe4, 0x98]);
    const decoded = decodeCp1256(encoded);
    expect(decoded).toBe(persian);
  });

  it("replaces non-cp1256 characters with '?' (0x3F)", () => {
    // A CJK char (1 UTF-16 code unit) + an emoji (2 UTF-16 code units,
    // surrogate pair) → 3 replacement bytes.
    const encoded = encodeCp1256("文🎉");
    expect(Array.from(encoded)).toEqual([0x3f, 0x3f, 0x3f]);
  });
});
