const CATALOG = [
  { match: /robot|autonom|slam|navigation/i, project: "Robotics system", language: "C++ 20 + Python", libraries: ["ROS 2", "Nav2", "OpenCV", "Gazebo"], security: ["SROS2", "mTLS device identity", "signed OTA updates"], style: "MISRA-inspired safety boundaries, composable ROS nodes", score: 94 },
  { match: /marketplace|commerce|shop|store/i, project: "Commerce platform", language: "TypeScript", libraries: ["Next.js", "PostgreSQL", "Stripe SDK", "Redis"], security: ["OIDC", "PCI-scoped tokenization", "idempotency keys"], style: "modular monolith with typed domain contracts", score: 93 },
  { match: /mobile|ios|android|fitness|social/i, project: "Mobile product", language: "TypeScript + Swift/Kotlin where native", libraries: ["React Native", "Expo", "PostgreSQL", "TanStack Query"], security: ["passkeys", "encrypted device storage", "certificate pinning"], style: "feature modules with offline-first repositories", score: 91 },
  { match: /ai|agent|model|rag|chat/i, project: "AI application", language: "Python + TypeScript", libraries: ["FastAPI", "Pydantic", "PostgreSQL + pgvector", "OpenTelemetry"], security: ["prompt isolation", "tool allowlists", "PII redaction"], style: "typed tools, evaluation-driven services", score: 92 },
  { match: /finance|bank|ledger|payment/i, project: "Financial system", language: "Kotlin + TypeScript", libraries: ["Ktor", "PostgreSQL", "Kafka", "OpenTelemetry"], security: ["OIDC", "immutable audit ledger", "field-level encryption"], style: "hexagonal architecture with double-entry invariants", score: 95 },
  { match: /.*/, project: "Web application", language: "TypeScript", libraries: ["React", "Node.js", "PostgreSQL", "OpenTelemetry"], security: ["OIDC", "least-privilege RBAC", "encrypted secrets"], style: "modular monolith with explicit domain contracts", score: 88 },
];

export function analyzeMission(mission) {
  const text = String(mission || "").trim();
  if (text.length < 12) throw Object.assign(new Error("Describe the product in at least 12 characters"), { status: 400 });
  const selected = CATALOG.find(item => item.match.test(text));
  const complexity = Math.min(10, 3 + (text.match(/,| and | with | that /gi)?.length || 0));
  const estimatedLines = Math.round((1800 + complexity * 1350) / 100) * 100;
  return {
    projectType: selected.project,
    language: selected.language,
    libraries: selected.libraries,
    security: selected.security,
    codingStyle: selected.style,
    fitScore: selected.score,
    estimatedLines: { low: estimatedLines, high: Math.round(estimatedLines * 1.8 / 100) * 100 },
    rationale: `Selected for delivery speed, ecosystem maturity, operational safety, and maintainability for this ${selected.project.toLowerCase()}.`,
    assumptions: ["The recommendation is a starting architecture, not a guarantee", "Validate regulated or safety-critical requirements with qualified reviewers"],
  };
}
