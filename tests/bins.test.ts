import {
  BANK_BINS,
  getBankNameByPan,
  getBankNameByBin,
} from "../src/bins";

describe("bank BIN lookup", () => {
  describe("BANK_BINS table", () => {
    it("contains exactly 23 entries (matching the original .NET binary)", () => {
      expect(BANK_BINS.length).toBe(23);
    });

    it("all BINs are 6-digit strings", () => {
      for (const entry of BANK_BINS) {
        expect(entry.bin).toMatch(/^\d{6}$/);
      }
    });

    it("all bank names are non-empty strings", () => {
      for (const entry of BANK_BINS) {
        expect(typeof entry.name).toBe("string");
        expect(entry.name.length).toBeGreaterThan(0);
      }
    });

    it("contains the expected Saman entry (first BIN in the .NET switch)", () => {
      expect(BANK_BINS[0]).toEqual({
        bin: "621986",
        name: "بانک سامان",
      });
    });

    it("contains the expected Kowsar entry (last BIN in the .NET switch)", () => {
      expect(BANK_BINS[BANK_BINS.length - 1]).toEqual({
        bin: "505801",
        name: "بانک کوثر",
      });
    });
  });

  describe("getBankNameByPan", () => {
    it("returns the bank name when the PAN starts with a known BIN", () => {
      expect(getBankNameByPan("6219860012345678")).toBe("بانک سامان");
      expect(getBankNameByPan("6221060012345678")).toBe("بانک پارسیان");
      expect(getBankNameByPan("6037990012345678")).toBe("بانک ملی");
    });

    it("returns empty string for unknown BIN", () => {
      expect(getBankNameByPan("9999990012345678")).toBe("");
    });

    it("returns empty string for PAN shorter than 6 chars", () => {
      expect(getBankNameByPan("6219")).toBe("");
    });

    it("returns empty string for null/undefined/empty PAN", () => {
      expect(getBankNameByPan(null)).toBe("");
      expect(getBankNameByPan(undefined)).toBe("");
      expect(getBankNameByPan("")).toBe("");
    });

    it("matches on exactly the first 6 digits only", () => {
      // 621986 should match Saman, but 621987 should not.
      expect(getBankNameByPan("6219861234567890")).toBe("بانک سامان");
      expect(getBankNameByPan("6219871234567890")).toBe("");
    });
  });

  describe("getBankNameByBin", () => {
    it("looks up by 6-digit BIN string", () => {
      expect(getBankNameByBin("621986")).toBe("بانک سامان");
    });

    it("returns empty string for short BIN", () => {
      expect(getBankNameByBin("6219")).toBe("");
    });

    it("returns empty string for unknown BIN", () => {
      expect(getBankNameByBin("999999")).toBe("");
    });

    it("takes only the first 6 chars if a longer string is passed", () => {
      expect(getBankNameByBin("621986XXXXXX")).toBe("بانک سامان");
    });
  });
});
