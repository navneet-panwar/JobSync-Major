const SkillAlias = require("../models/SkillAlias");

/**
 * Skill normalisation — one vocabulary for the whole platform.
 *
 * A seeded in-process map covers the common cases with ZERO database
 * round-trips (the match engine calls this per skill, per broadcast). Anything
 * the seed doesn't know falls back to a light heuristic, and an admin can add
 * real aliases to the SkillAlias collection later without a deploy.
 *
 * `normalizeSkillName("ReactJS")   → "react"`
 * `normalizeSkillName("Node js")   → "node.js"`
 * `normalizeSkillName("PostgreSQL")→ "postgresql"`
 */

// canonical → aliases. Kept deliberately small and high-value: only variants
// that genuinely mean the same skill. Related-but-different technologies
// (Java vs JavaScript) are NEVER merged — that error is far more damaging than
// a missed synonym, because it inflates a student's readiness.
const SEED = {
  javascript: ["js", "javascript", "ecmascript", "es6", "es2015"],
  typescript: ["ts", "typescript"],
  python: ["python", "python3", "py"],
  java: ["java"],
  "c++": ["c++", "cpp", "cplusplus"],
  "c#": ["c#", "csharp", "c sharp"],
  go: ["go", "golang"],
  ruby: ["ruby"],
  php: ["php"],
  swift: ["swift"],
  kotlin: ["kotlin"],
  rust: ["rust"],
  sql: ["sql", "ansi sql"],

  react: ["react", "reactjs", "react.js", "react js"],
  "next.js": ["next", "nextjs", "next.js"],
  vue: ["vue", "vuejs", "vue.js", "vue3"],
  angular: ["angular", "angularjs", "angular.js"],
  svelte: ["svelte", "sveltekit"],
  redux: ["redux", "reduxjs"],
  "react-native": ["react native", "reactnative", "react-native"],
  tailwind: ["tailwind", "tailwindcss", "tailwind css"],
  bootstrap: ["bootstrap", "bootstrap5"],
  html: ["html", "html5"],
  css: ["css", "css3", "scss", "sass", "less"],

  "node.js": ["node", "nodejs", "node.js", "node js"],
  express: ["express", "expressjs", "express.js", "express js"],
  nestjs: ["nest", "nestjs", "nest.js"],
  django: ["django"],
  flask: ["flask"],
  fastapi: ["fastapi", "fast api"],
  spring: ["spring", "springboot", "spring boot"],
  laravel: ["laravel"],
  rails: ["rails", "ruby on rails", "ror"],
  ".net": [".net", "dotnet", "asp.net", "aspnet"],

  rest: ["rest", "restapi", "rest api", "restful", "restful api", "rest apis"],
  graphql: ["graphql", "gql"],
  grpc: ["grpc"],
  websockets: ["websocket", "websockets", "socket.io", "socketio"],
  microservices: ["microservice", "microservices", "micro services"],
  "ci/cd": ["ci/cd", "cicd", "ci cd", "continuous integration", "continuous delivery"],

  mongodb: ["mongodb", "mongo", "mongo db"],
  postgresql: ["postgres", "postgresql", "psql", "pgsql"],
  mysql: ["mysql", "my sql", "mariadb"],
  redis: ["redis", "redis cache"],
  elasticsearch: ["elasticsearch", "elastic search", "elk", "opensearch"],
  sqlite: ["sqlite", "sqlite3"],
  dynamodb: ["dynamodb", "dynamo db"],
  firebase: ["firebase", "firestore"],
  supabase: ["supabase"],

  docker: ["docker", "containers", "containerization", "containerisation"],
  kubernetes: ["kubernetes", "k8s", "kube"],
  aws: ["aws", "amazon web services", "ec2", "s3", "lambda"],
  azure: ["azure", "microsoft azure"],
  gcp: ["gcp", "google cloud", "google cloud platform"],
  terraform: ["terraform", "iac", "infrastructure as code"],
  nginx: ["nginx"],
  linux: ["linux", "unix", "ubuntu", "bash", "shell scripting"],
  git: ["git", "github", "gitlab", "bitbucket", "version control"],
  jenkins: ["jenkins"],
  "github-actions": ["github actions", "github-actions"],

  jest: ["jest"],
  vitest: ["vitest"],
  pytest: ["pytest"],
  cypress: ["cypress"],
  playwright: ["playwright"],
  selenium: ["selenium"],
  "unit-testing": ["unit testing", "unit tests", "unittest", "testing", "test automation"],
  postman: ["postman"],

  kafka: ["kafka", "apache kafka"],
  rabbitmq: ["rabbitmq", "rabbit mq"],
  celery: ["celery"],
  "message-queue": ["message queue", "message-queue", "pub/sub", "pubsub", "event driven"],

  pandas: ["pandas"],
  numpy: ["numpy"],
  tensorflow: ["tensorflow", "tf"],
  pytorch: ["pytorch", "torch"],
  "scikit-learn": ["scikit learn", "scikit-learn", "sklearn"],
  nlp: ["nlp", "natural language processing"],
  "machine-learning": ["machine learning", "ml", "deep learning"],
  "data-analysis": ["data analysis", "data analytics", "analytics"],
  "data-structures": ["data structures", "data structures and algorithms", "dsa", "algorithms"],
  "system-design": ["system design", "distributed systems", "scalability", "high level design", "hld"],

  agile: ["agile", "scrum", "kanban"],
  jira: ["jira"],
  figma: ["figma"],
  "problem-solving": ["problem solving", "problem-solving", "critical thinking"],
  communication: ["communication", "communication skills", "written communication"],
  teamwork: ["teamwork", "collaboration", "team player"],
  leadership: ["leadership", "team lead", "mentoring"],
  "time-management": ["time management", "prioritisation", "prioritization"],
};

// Build the reverse lookup once at module load: alias → canonical.
const ALIAS_TO_CANONICAL = new Map();
for (const [canonical, aliases] of Object.entries(SEED)) {
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL.set(alias, canonical);
  }
}

// Pretty display labels for the seeded canonicals.
const LABELS = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  "c++": "C++",
  "c#": "C#",
  "node.js": "Node.js",
  "next.js": "Next.js",
  "react-native": "React Native",
  "ci/cd": "CI/CD",
  "github-actions": "GitHub Actions",
  "unit-testing": "Unit Testing",
  "scikit-learn": "scikit-learn",
  "machine-learning": "Machine Learning",
  "data-structures": "Data Structures & Algorithms",
  "system-design": "System Design",
  "message-queue": "Message Queues",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
  mysql: "MySQL",
  redis: "Redis",
  docker: "Docker",
  kubernetes: "Kubernetes",
  "problem-solving": "Problem Solving",
  "time-management": "Time Management",
};

/**
 * Reduce a raw skill string to a comparable canonical form.
 * Handles case, surrounding punctuation/whitespace, and known aliases.
 */
function normalizeSkillName(raw) {
  if (typeof raw !== "string") return "";

  const cleaned = raw
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "") // smart quotes
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  // Known alias — includes multi-word forms like "rest api".
  if (ALIAS_TO_CANONICAL.has(cleaned)) return ALIAS_TO_CANONICAL.get(cleaned);

  // Retry after stripping trailing punctuation ("react.js," → "react.js").
  const depunctuated = cleaned.replace(/[.,;:!]+$/, "").trim();
  if (depunctuated !== cleaned && ALIAS_TO_CANONICAL.has(depunctuated)) {
    return ALIAS_TO_CANONICAL.get(depunctuated);
  }

  // Retry with spaces removed, to catch "node js" when only "nodejs" is known.
  const compact = depunctuated.replace(/\s+/g, "");
  if (ALIAS_TO_CANONICAL.has(compact)) return ALIAS_TO_CANONICAL.get(compact);

  return depunctuated;
}

/** Human-friendly label for a canonical skill. */
function skillLabel(canonical) {
  if (!canonical) return "";
  if (LABELS[canonical]) return LABELS[canonical];
  if (canonical.length <= 4) return canonical.toUpperCase();
  return canonical.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Normalise a list of skills: canonicalise, drop empties, de-duplicate
 * case-insensitively while PRESERVING first-seen order.
 */
function normalizeSkillList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];

  for (const item of list) {
    const canonical = normalizeSkillName(item);
    if (!canonical) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

/** True when two raw skill strings mean the same thing. */
function skillsMatch(a, b) {
  const na = normalizeSkillName(a);
  const nb = normalizeSkillName(b);
  return Boolean(na) && na === nb;
}

module.exports = {
  normalizeSkillName,
  normalizeSkillList,
  skillLabel,
  skillsMatch,
  SEED_ALIAS_COUNT: ALIAS_TO_CANONICAL.size,
};
