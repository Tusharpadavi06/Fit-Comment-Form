export const SERIES_LIST = [
  "CB-101 Series",
  "CB-201 Series",
  "CB-301 Series",
  "CB-401 Series",
  "FB-501 Series",
  "FB-601 Series",
  "FB-701 Series",
  "FB-801 Series",
  "CB-901 Series",
  "CP-1101 Series",
  "CP-1201 Series",
  "CP-1301 Series",
  "CP-1401 Series",
  "CP-1501 Series",
  "FP-1601 Series",
  "FP-1701 Series",
  "FP-1801 Series",
  "CP-1901 Series",
  "Panty Packs",
  "SC Series",
  "CS Series",
  "SHW Series"
];

export function getSeriesFromStyleNumber(styleNo: string): string {
  if (!styleNo) return "General";
  
  const upper = styleNo.toUpperCase().trim();
  
  // Specific literal matches
  if (upper.includes("PANTY")) return "Panty Packs";
  if (upper.startsWith("SC")) return "SC Series";
  if (upper.startsWith("CS")) return "CS Series";
  if (upper.startsWith("SHW")) return "SHW Series";

  // Check for CB & CP or FB & FP numeric ranges
  const match = upper.match(/(CB|CP|FB|FP)[\s-]?(\d+)/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    if (!isNaN(num)) {
      if (prefix === "CB" || prefix === "CP") {
        // 101-200 -> 101 Series, 201-300 -> 210 Series, etc.
        if (num >= 101 && num <= 200) return "CB & CP-101 Series";
        if (num >= 201 && num <= 300) return "CB & CP-201 Series";
        if (num >= 301 && num <= 400) return "CB & CP-301 Series";
        if (num >= 401 && num <= 500) return "CB & CP-401 Series";
        if (num >= 501 && num <= 600) return "CB & CP-501 Series";
        if (num >= 601 && num <= 700) return "CB & CP-601 Series";
        if (num >= 701 && num <= 800) return "CB & CP-701 Series";
        if (num >= 801 && num <= 900) return "CB & CP-801 Series";
        if (num >= 901) return "CB & CP-901 Series";
      } else if (prefix === "FB" || prefix === "FP") {
        if (num >= 501 && num <= 600) return "FB & FP-501 Series";
        if (num >= 601 && num <= 700) return "FB & FP-601 Series";
        if (num >= 701 && num <= 800) return "FB & FP-701 Series";
        if (num >= 801 && num <= 900) return "FB & FP-801 Series";
      }
    }
  }

  return "General";
}

/**
 * Generates a stable deterministic UUID from a submissionId and modelEmail.
 * Ensures consistent assignment matching across devices, rounds, and databases.
 */
export function getDeterministicId(subId: string, email: string): string {
  if (!subId || !email) {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  const seed = `${subId}_${email.toLowerCase().trim()}`;
  
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0, ch; i < seed.length; i++) {
    ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const hex3 = ((h1 ^ 0x6E616E6F) >>> 0).toString(16).padStart(8, '0');
  const hex4 = ((h2 ^ 0x62756C6C) >>> 0).toString(16).padStart(8, '0');
  
  const fullHex = (hex1 + hex2 + hex3 + hex4).substring(0, 32);
  
  return `${fullHex.slice(0, 8)}-${fullHex.slice(8, 12)}-${fullHex.slice(12, 16)}-${fullHex.slice(16, 20)}-${fullHex.slice(20, 32)}`;
}
