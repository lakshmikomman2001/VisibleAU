export interface NapSource {
  label: string;
  name: string;
  address: string;
  phone: string;
}

export interface NapFinding {
  source: string;
  name: string;
  address: string;
  phone: string;
  matches: { name: boolean; address: boolean; phone: boolean };
}

export interface NapResult {
  score: number;
  findings: NapFinding[];
}

const AU_ADDRESS_ABBREV: Record<string, string> = {
  "\\bst\\b": "street",
  "\\brd\\b": "road",
  "\\bave\\b": "avenue",
  "\\bav\\b": "avenue",
  "\\bdr\\b": "drive",
  "\\bct\\b": "court",
  "\\bcl\\b": "close",
  "\\bpl\\b": "place",
  "\\bcr\\b": "crescent",
  "\\bhwy\\b": "highway",
  "\\bpde\\b": "parade",
  "\\blane\\b": "lane",
  "\\bblvd\\b": "boulevard",
  "\\bterr\\b": "terrace",
};

function normalise(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

function normaliseAddress(addr: string): string {
  let s = addr.toLowerCase().trim();
  for (const [abbrev, full] of Object.entries(AU_ADDRESS_ABBREV)) {
    s = s.replace(new RegExp(abbrev, "gi"), full);
  }
  return s.replace(/\s+/g, " ").trim();
}

function normalisePhone(phone: string): string {
  return phone.replace(/[\s\-()]+/g, "");
}

export function checkNapConsistency(sources: NapSource[]): NapResult {
  if (sources.length < 2) return { score: 100, findings: [] };

  let nameMatches = 0;
  let addressMatches = 0;
  let phoneMatches = 0;
  let total = 0;

  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i];
      const b = sources[j];
      nameMatches += normalise(a.name) === normalise(b.name) ? 1 : 0;
      addressMatches +=
        normaliseAddress(a.address) === normaliseAddress(b.address) ? 1 : 0;
      phoneMatches +=
        normalisePhone(a.phone) === normalisePhone(b.phone) ? 1 : 0;
      total++;
    }
  }

  const score =
    total > 0
      ? Number((((nameMatches + addressMatches + phoneMatches) / (total * 3)) * 100).toFixed(2))
      : 100;

  const findings: NapFinding[] = sources.map((s) => ({
    source: s.label,
    name: s.name,
    address: s.address,
    phone: s.phone,
    matches: { name: true, address: true, phone: true },
  }));

  return { score, findings };
}
