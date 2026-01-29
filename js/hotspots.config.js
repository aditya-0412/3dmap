// js/hotspots.config.js
//
// Hotspot UVs are approximate and assume an equirectangular-style world map:
// u = (longitude + 180) / 360
// v = (90 - latitude) / 180

export const HOTSPOTS = [
  {
    id: "cheltenham-master-pop",
    label: "Cheltenham Master POP",
    description:
      "Fully operational. Serving EMEA region. POP capacity: 800,000 DAU (@5% concurrency 40,000 users).",
    color: "#ff0000",
    // Cheltenham, UK ~ (51.9°N, 2.0°W)
    u: 0.49,
    v: 0.21
  },
  {
    id: "cheltenham-ai-node",
    label: "Cheltenham AI Node",
    description:
      "In test operation. Serving worldwide. Node capacity: 1,000,000 DAU (@1% concurrency 10,000 users).",
    color: "#ff0000",
    // Slightly above/beside Cheltenham Master POP
    u: 0.50,
    v: 0.19
  },
  {
    id: "ljubljana-pop",
    label: "Ljubljana POP",
    description:
      "Fully operational. Serving Central and Eastern Europe. POP capacity: 400,000 DAU (@5% concurrency 20,000 users).",
    color: "#ff0000",
    // Ljubljana, Slovenia ~ (46.1°N, 14.5°E)
    u: 0.54,
    v: 0.24
  },
  {
    id: "miami-pop",
    label: "Miami POP",
    description:
      "To be operational in March 2026. Serving North and South America. POP capacity: 600,000 DAU (@5% concurrency 30,000 users).",
    color: "#ff0000",
    // Miami, USA ~ (25.8°N, 80.2°W)
    u: 0.28,
    v: 0.36
  },
  {
    id: "angola-pop",
    label: "Angola POP",
    description:
      "Fully operational. Serving Africell subscribers nationwide. POP capacity: 400,000 DAU (@5% concurrency 20,000 users).",
    color: "#ff0000",
    // Luanda, Angola ~ (8.8°S, 13.2°E)
    u: 0.54,
    v: 0.55
  },
  {
    id: "johannesburg-pop",
    label: "Johannesburg POP",
    description:
      "To be operational in March 2026. Serving sub-Saharan Africa. POP capacity: 400,000 DAU (@5% concurrency 20,000 users).",
    color: "#ff0000",
    // Johannesburg, South Africa ~ (26.2°S, 28.0°E)
    u: 0.58,
    v: 0.65
  },
  {
    id: "singapore-pop",
    label: "Singapore POP",
    description:
      "To be operational in March 2026. Serving Eastern Hemisphere from India to Oceania. POP capacity: 400,000 DAU (@5% concurrency 20,000 users).",
    color: "#ff0000",
    // Singapore ~ (1.35°N, 103.8°E)
    u: 0.79,
    v: 0.49
  }
];