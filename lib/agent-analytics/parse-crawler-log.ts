import { createGunzip } from "zlib";
import { Readable } from "stream";
import { lookupByUserAgent, type RegistryMatch } from "./bot-registry";

export interface ParsedCrawlerHit {
  sourceIp: string;
  timestamp: Date;
  method: string;
  path: string;
  statusCode: number;
  bytes: number;
  userAgent: string;
  registryMatch: RegistryMatch;
}

// Static asset extensions to filter out (AA-12: count HTML/document hits only)
const STATIC_ASSET_RE =
  /\.(css|js|mjs|cjs|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|eot|otf|mp4|webm|ogg|mp3|wav|pdf|zip|gz|tar|map|json)(\?.*)?$/i;

// Combined/Common Log Format regex
// 127.0.0.1 - - [10/Oct/2000:13:55:36 -0700] "GET /page HTTP/1.1" 200 2326 "http://ref.example" "Mozilla/5.0"
const CLF_RE =
  /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d{3})\s+(\d+|-)/;
const CLF_EXTENDED_RE =
  /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d{3})\s+(\d+|-)\s+"[^"]*"\s+"([^"]*)"/;

function parseClfDate(dateStr: string): Date {
  // CLF format: 10/Oct/2000:13:55:36 -0700
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const m = dateStr.match(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})/);
  if (!m) return new Date(dateStr);
  const [, day, mon, year, hh, mm, ss, tz] = m;
  return new Date(`${year}-${months[mon]}-${day}T${hh}:${mm}:${ss}${tz.slice(0, 3)}:${tz.slice(3)}`);
}

function parseLine(line: string): {
  ip: string;
  timestamp: Date;
  method: string;
  path: string;
  statusCode: number;
  bytes: number;
  userAgent: string;
} | null {
  const extended = CLF_EXTENDED_RE.exec(line);
  if (extended) {
    return {
      ip: extended[1],
      timestamp: parseClfDate(extended[2]),
      method: extended[3],
      path: extended[4],
      statusCode: parseInt(extended[5], 10),
      bytes: extended[6] === "-" ? 0 : parseInt(extended[6], 10),
      userAgent: extended[7],
    };
  }

  const basic = CLF_RE.exec(line);
  if (basic) {
    return {
      ip: basic[1],
      timestamp: parseClfDate(basic[2]),
      method: basic[3],
      path: basic[4],
      statusCode: parseInt(basic[5], 10),
      bytes: basic[6] === "-" ? 0 : parseInt(basic[6], 10),
      userAgent: "",
    };
  }

  return null;
}

function parseCsvLine(line: string, headers: string[]): {
  ip: string;
  timestamp: Date;
  method: string;
  path: string;
  statusCode: number;
  bytes: number;
  userAgent: string;
} | null {
  const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
  const row: Record<string, string> = {};
  headers.forEach((h, i) => { row[h.toLowerCase()] = values[i] ?? ""; });

  const ip = row["ip"] || row["source_ip"] || row["client_ip"] || row["remote_addr"] || "";
  const ua = row["user_agent"] || row["useragent"] || row["ua"] || "";
  const path = row["path"] || row["url"] || row["uri"] || row["request_uri"] || "";
  const status = parseInt(row["status"] || row["status_code"] || "0", 10);
  const bytes = parseInt(row["bytes"] || row["body_bytes_sent"] || "0", 10);
  const ts = row["timestamp"] || row["time"] || row["date"] || "";

  if (!ip || !ua) return null;

  return {
    ip,
    timestamp: new Date(ts),
    method: row["method"] || "GET",
    path,
    statusCode: isNaN(status) ? 0 : status,
    bytes: isNaN(bytes) ? 0 : bytes,
    userAgent: ua,
  };
}

async function decompressGzip(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();
    const readable = Readable.from(buffer);
    readable.pipe(gunzip);
    gunzip.on("data", (chunk) => chunks.push(chunk as Buffer));
    gunzip.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    gunzip.on("error", reject);
  });
}

export async function parseCrawlerLog(
  content: string | Buffer,
  filename: string,
): Promise<{ hits: ParsedCrawlerHit[]; discardedHuman: number; discardedStatic: number; totalLines: number }> {
  let text: string;

  if (Buffer.isBuffer(content)) {
    if (filename.endsWith(".gz")) {
      text = await decompressGzip(content);
    } else {
      text = content.toString("utf-8");
    }
  } else {
    text = content;
  }

  const lines = text.split("\n").filter((l) => l.trim());
  const isCsv = filename.endsWith(".csv");

  let csvHeaders: string[] = [];
  let startIdx = 0;
  if (isCsv && lines.length > 0) {
    csvHeaders = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    startIdx = 1;
  }

  const hits: ParsedCrawlerHit[] = [];
  let discardedHuman = 0;
  let discardedStatic = 0;
  const seen = new Set<string>();

  for (let i = startIdx; i < lines.length; i++) {
    const parsed = isCsv
      ? parseCsvLine(lines[i], csvHeaders)
      : parseLine(lines[i]);

    if (!parsed) continue;
    if (!parsed.userAgent) continue;

    // AA-12: filter out static assets at parse time
    if (STATIC_ASSET_RE.test(parsed.path)) {
      discardedStatic++;
      continue;
    }

    // AA-12: discard non-AI-bot traffic — only rows matching a registry ua_token are stored
    const match = await lookupByUserAgent(parsed.userAgent);
    if (!match) {
      discardedHuman++;
      continue;
    }

    // AA-02: dedup by (ip, path, timestamp, crawler)
    const dedupKey = `${parsed.ip}|${match.uaToken}|${parsed.path}|${parsed.timestamp.toISOString()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    hits.push({
      sourceIp: parsed.ip,
      timestamp: parsed.timestamp,
      method: parsed.method,
      path: parsed.path,
      statusCode: parsed.statusCode,
      bytes: parsed.bytes,
      userAgent: parsed.userAgent,
      registryMatch: match,
    });
  }

  return { hits, discardedHuman, discardedStatic, totalLines: lines.length };
}
