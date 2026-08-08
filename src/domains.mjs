export const DOMAINS = Object.freeze({
  database: {
    label: "Database Architect",
    roots: ["db/", "migrations/", "schema/"],
    forbidden: ["auth/", "ui/", "infra/", "billing/"],
    system: "Work only on schemas, queries, migrations, indexes, retention, backups, and data access contracts.",
  },
  auth: {
    label: "Security & Auth",
    roots: ["auth/", "security/"],
    forbidden: ["db/", "ui/", "infra/", "billing/"],
    system: "Work only on identity, sessions, authorization, secrets, audit controls, and security policy.",
  },
  frontend: {
    label: "Product Interface",
    roots: ["ui/", "web/", "mobile/"],
    forbidden: ["db/", "auth/", "infra/", "billing/"],
    system: "Work only on client interfaces, accessibility, interaction, state presentation, and design systems.",
  },
  infrastructure: {
    label: "Infrastructure Engineer",
    roots: ["infra/", "deploy/", ".github/", "package.json", "package-lock.json", "pyproject.toml", "requirements.txt", "Cargo.toml", "Cargo.lock", "go.mod", "go.sum", "Dockerfile", "README.md"],
    forbidden: ["db/", "auth/", "ui/", "billing/"],
    system: "Work only on deployment, observability, CI, containers, networking, reliability, and cloud resources.",
  },
  intelligence: {
    label: "AI & Domain Intelligence",
    roots: ["intelligence/", "robotics/", "ml/"],
    forbidden: ["db/", "auth/", "ui/", "infra/"],
    system: "Work only on model, robotics, decision, perception, planning, evaluation, and inference code.",
  },
  billing: {
    label: "Billing Engineer",
    roots: ["billing/", "payments/"],
    forbidden: ["db/", "auth/", "ui/", "infra/"],
    system: "Work only on prices, subscriptions, ledgers, invoices, payment providers, and billing contracts.",
  },
});

export function getDomain(name) {
  const domain = DOMAINS[name];
  if (!domain) throw Object.assign(new Error(`Unknown role: ${name}`), { status: 400 });
  return domain;
}

export function assertBoundary(domainName, changes) {
  const domain = getDomain(domainName);
  const violations = [];
  for (const change of changes) {
    const path = String(change.path || "").replace(/^\/+/, "");
    const allowed = domain.roots.some(root => path.startsWith(root));
    if (!path || path.includes("..") || !allowed) violations.push(path || "<missing path>");
  }
  if (violations.length) {
    const error = new Error(`${domain.label} cannot modify files outside ${domain.roots.join(", ")}`);
    error.status = 403;
    error.code = "BOUNDARY_VIOLATION";
    error.details = { violations, allowedRoots: domain.roots };
    throw error;
  }
  return true;
}
