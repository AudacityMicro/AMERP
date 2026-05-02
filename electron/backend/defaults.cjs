"use strict";

const DEFAULT_LIBRARY_DEFINITIONS = [
  { name: "machines", label: "Machines", order: 10, records: [] },
  { name: "fixtures", label: "Fixtures", order: 20, records: [] },
  { name: "cuttingTools", label: "Cutting Tools", order: 30, records: [] },
  { name: "sawBlades", label: "Saw Blades", order: 40, records: [] },
  { name: "blastMedia", label: "Blast Media", order: 50, records: [] },
  { name: "tumblingMedia", label: "Tumbling Media", order: 60, records: [] },
  { name: "gauges", label: "Common Gauges", order: 70, records: [] }
];

const DEFAULT_TEMPLATES = [
  {
    id: "sawing",
    name: "Sawing",
    category: "Cutoff",
    libraryNames: ["machines", "sawBlades"],
    defaultParameters: [
      { id: "blade", label: "Blade", value: "" },
      { id: "feed-rate", label: "Feed rate", value: "" },
      { id: "coolant", label: "Coolant", value: "" }
    ],
    defaultSteps: [
      "Verify material, cut list, and saw blade.",
      "Set stop or mark material.",
      "Cut and deburr parts."
    ]
  },
  {
    id: "milling",
    name: "Milling",
    category: "Machining",
    libraryNames: ["machines", "fixtures", "cuttingTools"],
    defaultParameters: [
      { id: "work-offset", label: "Work offset", value: "G54" },
      { id: "fixture", label: "Fixture", value: "" },
      { id: "coolant", label: "Coolant", value: "" }
    ],
    defaultSteps: [
      "Load and indicate fixture.",
      "Load tools and verify stickout.",
      "Run first article and inspect critical features."
    ]
  },
  {
    id: "turning",
    name: "Turning",
    category: "Machining",
    libraryNames: ["machines", "fixtures", "cuttingTools"],
    defaultParameters: [
      { id: "chuck", label: "Chuck / collet", value: "" },
      { id: "work-offset", label: "Work offset", value: "G54" },
      { id: "coolant", label: "Coolant", value: "" }
    ],
    defaultSteps: [
      "Load stock and set stickout.",
      "Set tools and offsets.",
      "Run first piece and verify dimensions."
    ]
  },
  {
    id: "inspection",
    name: "Inspection",
    category: "Quality",
    libraryNames: ["gauges"],
    defaultParameters: [
      { id: "sample-size", label: "Sample size", value: "" },
      { id: "critical-features", label: "Critical features", value: "" }
    ],
    defaultSteps: [
      "Inspect critical features.",
      "Record measured results.",
      "Segregate nonconforming parts."
    ]
  },
  {
    id: "deburr",
    name: "Deburr",
    category: "Finishing",
    libraryNames: [],
    defaultParameters: [
      { id: "method", label: "Method", value: "" }
    ],
    defaultSteps: [
      "Break sharp edges.",
      "Protect controlled edges and surfaces.",
      "Inspect for burrs."
    ]
  },
  {
    id: "generic",
    name: "Generic Operation",
    category: "General",
    libraryNames: [],
    defaultParameters: [
      { id: "parameter", label: "Parameter", value: "" }
    ],
    defaultSteps: [
      "Document operation instructions."
    ]
  }
];

const MATERIAL_CONSTANTS = {
  traceabilityLevels: ["Standard material certs", "COC", "Full traceability"],
  attachmentCategories: ["Mill cert", "COC", "Photo", "Other"],
  forms: ["Round bar", "Round Tube", "Sheet", "Rectangle bar", "Rectangle Tube", "Angle", "Other"]
};

module.exports = {
  DEFAULT_LIBRARY_DEFINITIONS,
  DEFAULT_TEMPLATES,
  MATERIAL_CONSTANTS
};
