// Parser for the eSSL / ZKTeco "push" (ADMS, /iclock/cdata) protocol.
// Devices POST attendance logs as plain text, one record per line, tab separated:
//   PIN \t YYYY-MM-DD HH:MM:SS \t in/out state \t verify mode \t work code \t ...
// Times are the device's local clock, which we treat as IST.
import { istDateTime } from "./time";

export interface ParsedPunch {
  deviceUserId: string;
  punchTime: Date;
  inOutState: number | null;
  verifyMode: number | null;
}

const LINE = /^(\S+)\t(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\t(-?\d+))?(?:\t(-?\d+))?/;

export function parseAttlog(body: string): { punches: ParsedPunch[]; rejected: string[] } {
  const punches: ParsedPunch[] = [];
  const rejected: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line) continue;
    const m = LINE.exec(line);
    if (!m) {
      rejected.push(line);
      continue;
    }
    const punchTime = istDateTime(m[2], m[3]);
    if (Number.isNaN(punchTime.getTime())) {
      rejected.push(line);
      continue;
    }
    punches.push({
      deviceUserId: m[1],
      punchTime,
      inOutState: m[4] !== undefined ? Number(m[4]) : null,
      verifyMode: m[5] !== undefined ? Number(m[5]) : null,
    });
  }
  return { punches, rejected };
}

/** Reply to the device's GET /iclock/cdata?SN=...&options=all handshake. */
export function handshakeResponse(serial: string, attStamp: string): string {
  return [
    `GET OPTION FROM: ${serial}`,
    `ATTLOGStamp=${attStamp}`,
    "OPERLOGStamp=9999",
    "ATTPHOTOStamp=None",
    "ErrorDelay=60",
    "Delay=30",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=1111000000",
    "TimeZone=330",
    "Realtime=1",
    "Encrypt=0",
  ].join("\n");
}
