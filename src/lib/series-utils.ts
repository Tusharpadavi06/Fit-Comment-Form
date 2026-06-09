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
