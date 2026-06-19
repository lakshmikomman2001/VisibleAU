interface AuTldResult {
  auTldPresent: boolean;
  auTldDomains: string[];
}

export function checkAuTld(domain: string): AuTldResult {
  if (!domain) return { auTldPresent: false, auTldDomains: [] };

  const auTlds = [".com.au", ".net.au", ".org.au", ".edu.au", ".gov.au", ".asn.au", ".id.au"];
  const lower = domain.toLowerCase();
  const isAuTld = auTlds.some((tld) => lower.endsWith(tld));

  return {
    auTldPresent: isAuTld,
    auTldDomains: isAuTld ? [domain] : [],
  };
}
