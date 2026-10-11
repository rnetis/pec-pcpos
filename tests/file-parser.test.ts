import { parseRequestFile, parseLine, parseKvList } from "../src/file-parser";

describe("file parser", () => {
  describe("parseLine", () => {
    it("splits on the first = sign", () => {
      expect(parseLine("KEY=VALUE")).toEqual(["KEY", "VALUE"]);
    });

    it("handles values that contain = signs (splits only on the first)", () => {
      expect(parseLine("KEY=VAL=UE=FOO")).toEqual(["KEY", "VAL=UE=FOO"]);
    });

    it("returns null for lines without =", () => {
      expect(parseLine("NO_KEY_HERE")).toBeNull();
    });

    it("handles empty values", () => {
      expect(parseLine("KEY=")).toEqual(["KEY", ""]);
    });

    it("handles empty keys (degenerate case)", () => {
      expect(parseLine("=VALUE")).toEqual(["", "VALUE"]);
    });
  });

  describe("parseKvList", () => {
    it("parses comma-separated key=value pairs", () => {
      const result = parseKvList("AC=1111,AM=2222,AC=3333,AM=4444");
      expect(result).toEqual([
        { key: "AC", value: "1111" },
        { key: "AM", value: "2222" },
        { key: "AC", value: "3333" },
        { key: "AM", value: "4444" },
      ]);
    });

    it("parses newline-separated pairs", () => {
      const result = parseKvList("AC=1111\nAM=2222\nAC=3333\nAM=4444");
      expect(result).toEqual([
        { key: "AC", value: "1111" },
        { key: "AM", value: "2222" },
        { key: "AC", value: "3333" },
        { key: "AM", value: "4444" },
      ]);
    });

    it("parses crlf-separated pairs", () => {
      const result = parseKvList("AC=1111\r\nAM=2222\r\nAC=3333\r\nAM=4444");
      expect(result).toEqual([
        { key: "AC", value: "1111" },
        { key: "AM", value: "2222" },
        { key: "AC", value: "3333" },
        { key: "AM", value: "4444" },
      ]);
    });

    it("returns empty array for empty input", () => {
      expect(parseKvList("")).toEqual([]);
    });

    it("skips entries without =", () => {
      const result = parseKvList("AC=1111,GARBAGE,AM=2222");
      expect(result).toEqual([
        { key: "AC", value: "1111" },
        { key: "AM", value: "2222" },
      ]);
    });
  });

  describe("parseRequestFile — happy paths", () => {
    it("parses a minimal LAN request", () => {
      const contents = [
        "AMOUNT=1000",
        "TYPE=LAN",
        "IP=192.168.10.20",
        "PORT=7020",
      ].join("\r\n");
      const opts = parseRequestFile(contents);
      expect(opts.amount).toBe("1000");
      expect(opts.type).toBe("LAN");
      expect(opts.ip).toBe("192.168.10.20");
      expect(opts.port).toBe(7020);
      // Defaults are NOT applied by the parser — those live in buildMessage.
      expect(opts.prCode).toBeUndefined();
      expect(opts.currency).toBeUndefined();
    });

    it("parses a minimal SERIAL request", () => {
      const contents = [
        "AMOUNT=1000",
        "TYPE=SERIAL",
        "COMPORT=COM3",
      ].join("\r\n");
      const opts = parseRequestFile(contents);
      expect(opts.amount).toBe("1000");
      expect(opts.type).toBe("SERIAL");
      expect(opts.comPort).toBe("COM3");
    });

    it("parses all optional additional parameters", () => {
      const contents = [
        "AMOUNT=5000",
        "TYPE=LAN",
        "IP=192.168.10.20",
        "PORT=7020",
        "PRCODE=001000",
        "CURRENCY=840",
        "CARDHOLDERRECEIPT=Cardholder receipt body",
        "CARDHOLDERTITLE=Cardholder title",
        "MERCHANTRECEIPT=Merchant receipt body",
        "MERCHANTTITLE=Merchant title",
        "SERVICE=BILLPAY",
        "SERVICEGROUP=UTILITIES",
        "SETTELMENT=AC=1111,AM=2222,AC=3333,AM=4444",
        "KEYVALUE=KY=foo,VL=bar",
      ].join("\r\n");
      const opts = parseRequestFile(contents);
      expect(opts.prCode).toBe("001000");
      expect(opts.currency).toBe("840");
      expect(opts.cardholderReceipt).toBe("CARDHOLDER RECEIPT BODY");
      expect(opts.cardholderTitle).toBe("CARDHOLDER TITLE");
      expect(opts.merchantReceipt).toBe("MERCHANT RECEIPT BODY");
      expect(opts.merchantTitle).toBe("MERCHANT TITLE");
      expect(opts.service).toBe("BILLPAY");
      expect(opts.serviceGroup).toBe("UTILITIES");
      expect(opts.settlement).toEqual([
        { account: "1111", amount: "2222" },
        { account: "3333", amount: "4444" },
      ]);
      // Note: parseKvList splits at the FIRST '=' of each line, so
      // `KY=foo,VL=bar` becomes [{key:"KY",value:"FOO"},{key:"VL",value:"BAR"}].
      // This is faithful to the original .NET behaviour — the KY/VL
      // sub-block tags are added by BuildMsg, NOT by the file parser.
      expect(opts.keyValue).toEqual([
        { key: "KY", value: "FOO" },
        { key: "VL", value: "BAR" },
      ]);
    });

    it("is case-insensitive (matches original .ToUpper() behaviour)", () => {
      const contents = ["amount=1000", "type=lan", "ip=192.168.10.20", "port=7020"].join("\n");
      const opts = parseRequestFile(contents);
      expect(opts.amount).toBe("1000");
      expect(opts.type).toBe("LAN");
      expect(opts.ip).toBe("192.168.10.20");
      expect(opts.port).toBe(7020);
    });

    it("ignores lines without =", () => {
      const contents = ["# This is a comment", "AMOUNT=1000", "garbage", "TYPE=LAN", "IP=192.168.10.20", "PORT=7020"].join("\n");
      const opts = parseRequestFile(contents);
      expect(opts.amount).toBe("1000");
      expect(opts.type).toBe("LAN");
    });
  });

  describe("parseRequestFile — error paths (must match .NET exception strings exactly)", () => {
    it("throws when AMOUNT is missing (exact .NET message)", () => {
      expect(() =>
        parseRequestFile("TYPE=LAN\r\nIP=1.2.3.4\r\nPORT=7020"),
      ).toThrow("Amount must be specified. for example Amount=1000");
    });

    it("throws when AMOUNT is not a valid unsigned integer", () => {
      expect(() =>
        parseRequestFile("AMOUNT=abc\r\nTYPE=LAN\r\nIP=1.2.3.4\r\nPORT=7020"),
      ).toThrow("Amount has not valid value.");
    });

    it("throws when TYPE is missing (exact .NET message)", () => {
      expect(() => parseRequestFile("AMOUNT=1000")).toThrow(
        "Type is not specified. Use LAN or SERIAL as type.\r\n for example type=LAN",
      );
    });

    it("throws when TYPE is not LAN or SERIAL", () => {
      expect(() => parseRequestFile("AMOUNT=1000\r\nTYPE=USB")).toThrow(
        "Type is not valid. Use LAN or SERIAL only.\r\n for example type=LAN",
      );
    });

    it("throws when TYPE=LAN but IP is missing (exact .NET message — note 'port is not specified' typo)", () => {
      expect(() => parseRequestFile("AMOUNT=1000\r\nTYPE=LAN\r\nPORT=7020")).toThrow(
        "port is not specified. Use POS LAN Ip.\r\n for example ip=192.168.10.20",
      );
    });

    it("throws when TYPE=LAN but PORT is missing", () => {
      expect(() =>
        parseRequestFile("AMOUNT=1000\r\nTYPE=LAN\r\nIP=192.168.10.20"),
      ).toThrow(
        "port is not specified. Use POS LAN port number.\r\n for example port=7020",
      );
    });

    it("throws when TYPE=LAN and PORT is out of range", () => {
      expect(() =>
        parseRequestFile("AMOUNT=1000\r\nTYPE=LAN\r\nIP=192.168.10.20\r\nPORT=99999"),
      ).toThrow(
        "Port has not valid value. a port number must be between 1 to 65535",
      );
    });

    it("throws when TYPE=SERIAL but COMPORT is missing", () => {
      expect(() => parseRequestFile("AMOUNT=1000\r\nTYPE=SERIAL")).toThrow(
        "com port is not specified. Use SERIAL port number.\r\n for example comport=COM3",
      );
    });
  });
});
