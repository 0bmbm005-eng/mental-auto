import type { Finding, ScanReport } from "./types.js";

const EMAIL_PATTERN = /\b([\w.+-])[\w.+-]*@([\w.-]+\.[A-Za-z]{2,})\b/gu;
const TOKEN_PATTERN =
  /\b(?=[A-Za-z0-9._-]{12,}\b)(?=[A-Za-z0-9._-]*[\d_-])[A-Za-z0-9._-]+\b/gu;

function maskToken(token: string): string {
  if (token.length <= 8) {
    return `${token.slice(0, 2)}****`;
  }

  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

export function maskText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, (_, first: string, domain: string) => {
      return `${first}***@${domain}`;
    })
    .replace(TOKEN_PATTERN, (token) => maskToken(token));
}

export function maskFinding(finding: Finding): Finding {
  return {
    ...finding,
    message: maskText(finding.message),
    excerpt:
      finding.excerpt === undefined ? undefined : maskText(finding.excerpt),
  };
}

export function maskReport(report: ScanReport): ScanReport {
  return {
    ...report,
    findings: report.findings.map((finding) => maskFinding(finding)),
    notes: report.notes.map((note) => maskText(note)),
  };
}
