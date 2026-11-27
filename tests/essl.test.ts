import { describe, expect, it } from "vitest";
import { parseAttlog } from "../src/lib/domain/essl";

describe("parseAttlog", () => {
  it("parses tab-separated ATTLOG lines as IST", () => {
    const body = "101\t2026-11-27 09:31:05\t0\t1\t0\t0\n102\t2026-11-27 09:45:00\t1\t15\r\n\n";
    const { punches, rejected } = parseAttlog(body);
    expect(rejected).toEqual([]);
    expect(punches).toHaveLength(2);
    expect(punches[0].deviceUserId).toBe("101");
    expect(punches[0].punchTime.toISOString()).toBe("2026-11-27T04:01:05.000Z");
    expect(punches[1].verifyMode).toBe(15);
  });

  it("rejects malformed lines", () => {
    const { punches, rejected } = parseAttlog("garbage line\n101\t2026-13-45 99:00:00\t0\t1");
    expect(punches).toHaveLength(0);
    expect(rejected).toHaveLength(2);
  });
});
