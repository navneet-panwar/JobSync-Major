import {
  Document,
  Page,
  Text,
  View,
  Link,
  StyleSheet,
} from "@react-pdf/renderer";

/**
 * Single-page, ATS-optimized resume renderer.
 *
 * ATS rules applied here:
 *  - One column only (no tables, no multi-column text flow, no text boxes)
 *  - Standard section headings a parser recognizes: SUMMARY / EXPERIENCE /
 *    PROJECTS / EDUCATION / SKILLS / CERTIFICATIONS
 *  - Real selectable text (never an image), Helvetica base font
 *  - Contact details as plain text lines (parsers read these reliably)
 *  - Borderless bullets (a glyph, not a graphic) so parsers keep the text
 *  - All content forced onto one page via aggressive but readable compaction
 */

const C = {
  ink: "#111418",
  inkMuted: "#4A525C",
  accent: "#1F3A2E",
  rule: "#C9CFD6",
  bg: "#FFFFFF",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 30,
    paddingHorizontal: 42,
    fontSize: 9,
    color: C.ink,
    fontFamily: "Helvetica",
    backgroundColor: C.bg,
    lineHeight: 1.34,
  },

  // header
  name: {
    fontSize: 19,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    lineHeight: 1.1,
    marginBottom: 2,
  },
  title: {
    fontSize: 9.75,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    marginBottom: 3,
  },
  contactLine: {
    fontSize: 8.5,
    color: C.inkMuted,
    lineHeight: 1.35,
    marginBottom: 1,
  },
  link: {
    color: C.accent,
    textDecoration: "none",
  },
  headerRule: {
    marginTop: 6,
    height: 0.8,
    backgroundColor: C.accent,
  },

  // sections
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 9.25,
    fontFamily: "Helvetica-Bold",
    color: C.accent,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  sectionRule: {
    height: 0.6,
    backgroundColor: C.rule,
    marginBottom: 4,
  },

  summary: {
    fontSize: 9,
    color: C.ink,
    lineHeight: 1.38,
  },

  // experience / projects
  entry: {
    marginBottom: 5,
  },
  entryHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  entryRole: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
  },
  entryPeriod: {
    fontSize: 8.5,
    color: C.inkMuted,
  },
  entryOrg: {
    fontSize: 8.75,
    color: C.accent,
    marginBottom: 2,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 1.5,
  },
  bulletMark: {
    width: 8,
    fontSize: 9,
    color: C.accent,
    lineHeight: 1.38,
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    color: C.ink,
    lineHeight: 1.38,
  },

  // skills
  skillLine: {
    fontSize: 9,
    color: C.ink,
    lineHeight: 1.42,
  },
  skillLabel: {
    fontFamily: "Helvetica-Bold",
    color: C.ink,
  },

  // education / certifications
  eduRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 1,
  },
  eduDegree: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  eduMeta: {
    fontSize: 8.5,
    color: C.inkMuted,
  },
  eduSchool: {
    fontSize: 8.75,
    color: C.accent,
    marginBottom: 2,
  },
  certLine: {
    fontSize: 9,
    color: C.ink,
    lineHeight: 1.38,
    marginBottom: 1,
  },
});

function SectionTitle({ children }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{children}</Text>
      <View style={styles.sectionRule} />
    </View>
  );
}

function Bullet({ children }) {
  return (
    <View style={styles.bulletRow} wrap={false}>
      <Text style={styles.bulletMark}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

/** Collapse run-on / hallucinated tech lists into a clean, short set. */
function cleanTech(tech) {
  if (!Array.isArray(tech)) return [];
  const seen = new Set();
  const out = [];
  for (const t of tech) {
    if (typeof t !== "string") continue;
    const v = t.trim();
    if (!v || v.length > 32) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= 8) break;
  }
  return out;
}

/** Keep only the first N bullets per entry so we stay on one page. */
function limitBullets(bullets, n) {
  return (Array.isArray(bullets) ? bullets : []).slice(0, n);
}

function shortenUrl(url = "") {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

export function ResumeDocument({ user, version, title }) {
  const p = version?.parsedSections || {};
  const basics = p.basics || {};

  const displayName = basics.name?.trim() || user?.name || "Your Name";
  const displayEmail = basics.email?.trim() || user?.email || "";

  // ---- contact rendered as plain lines, ATS-safe ----
  const contactParts = [
    basics.location?.trim(),
    basics.phone?.trim(),
    displayEmail,
  ].filter(Boolean);

  const links = (basics.links || []).filter((l) => l?.url);

  // ---- compaction budgets (tuned to fit one A4 page) ----
  const experience = (p.experience || []).slice(0, 4);
  const projects = (p.projects || []).slice(0, 3);
  const education = (p.education || []).slice(0, 3);
  const skills = Array.isArray(p.skills) ? p.skills.slice(0, 24) : [];
  const certifications = (p.certifications || []).slice(0, 4);

  // Bullet budget: more entries => fewer bullets each, so total stays on one page.
  const expBulletCap = experience.length <= 2 ? 5 : experience.length === 3 ? 4 : 3;
  const projBulletCap = 2;

  return (
    <Document
      title={title || displayName || "Resume"}
      author={displayName}
      subject="Resume"
    >
      <Page size="A4" style={styles.page}>
        {/* ================= HEADER ================= */}
        <Text style={styles.name}>{displayName}</Text>
        {basics.title ? <Text style={styles.title}>{basics.title}</Text> : null}

        {contactParts.length > 0 && (
          <Text style={styles.contactLine}>{contactParts.join("  |  ")}</Text>
        )}

        {links.length > 0 && (
          <Text style={styles.contactLine}>
            {links.map((l, i) => (
              <Text key={i}>
                {i > 0 ? "  |  " : ""}
                <Link src={l.url} style={styles.link}>
                  {l.label ? `${l.label}: ${shortenUrl(l.url)}` : shortenUrl(l.url)}
                </Link>
              </Text>
            ))}
          </Text>
        )}

        <View style={styles.headerRule} />

        {/* ================= SUMMARY ================= */}
        {p.summary ? (
          <View style={styles.section}>
            <SectionTitle>Summary</SectionTitle>
            <Text style={styles.summary}>{p.summary}</Text>
          </View>
        ) : null}

        {/* ================= EXPERIENCE ================= */}
        {experience.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle>Experience</SectionTitle>
            {experience.map((exp, i) => (
              <View key={i} style={styles.entry}>
                <View style={styles.entryHeadRow}>
                  <Text style={styles.entryRole}>{exp.role || "Role"}</Text>
                  {exp.period ? (
                    <Text style={styles.entryPeriod}>{exp.period}</Text>
                  ) : null}
                </View>
                {(exp.company || exp.location) && (
                  <Text style={styles.entryOrg}>
                    {[exp.company, exp.location].filter(Boolean).join(" · ")}
                  </Text>
                )}
                {limitBullets(exp.bullets, expBulletCap).map((b, j) => (
                  <Bullet key={j}>{b}</Bullet>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {/* ================= PROJECTS ================= */}
        {projects.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle>Projects</SectionTitle>
            {projects.map((proj, i) => {
              const tech = cleanTech(proj.tech);
              const bullets = limitBullets(proj.bullets, projBulletCap);

              return (
                <View key={i} style={styles.entry}>
                  <View style={styles.entryHeadRow}>
                    <Text style={styles.entryRole}>{proj.name || "Project"}</Text>
                    {tech.length > 0 ? (
                      <Text style={styles.entryPeriod}>{tech.join(" · ")}</Text>
                    ) : null}
                  </View>

                  {/* Prefer structured bullets when the parser produced them,
                      otherwise fall back to the description sentence. */}
                  {bullets.length > 0
                    ? bullets.map((b, j) => <Bullet key={j}>{b}</Bullet>)
                    : proj.description
                    ? <Bullet>{proj.description}</Bullet>
                    : null}

                  {proj.links?.length ? (
                    <Text style={styles.entryOrg}>
                      {proj.links
                        .filter((l) => l?.url)
                        .map((l, j) => (
                          <Text key={j}>
                            {j > 0 ? "  |  " : ""}
                            <Link src={l.url} style={styles.link}>
                              {shortenUrl(l.url)}
                            </Link>
                          </Text>
                        ))}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* ================= SKILLS ================= */}
        {skills.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle>Skills</SectionTitle>
            <Text style={styles.skillLine}>
              <Text style={styles.skillLabel}>Technical: </Text>
              {skills.join(", ")}
            </Text>
            {p.languages?.length > 0 && (
              <Text style={styles.skillLine}>
                <Text style={styles.skillLabel}>Languages: </Text>
                {p.languages.join(", ")}
              </Text>
            )}
          </View>
        ) : null}

        {/* ================= EDUCATION ================= */}
        {education.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle>Education</SectionTitle>
            {education.map((edu, i) => (
              <View key={i} style={styles.entry}>
                <View style={styles.eduRow}>
                  <Text style={styles.eduDegree}>{edu.degree}</Text>
                  {edu.period ? (
                    <Text style={styles.eduMeta}>{edu.period}</Text>
                  ) : null}
                </View>
                {(edu.school || edu.location) && (
                  <Text style={styles.eduSchool}>
                    {[edu.school, edu.location].filter(Boolean).join(" · ")}
                  </Text>
                )}
                {edu.details ? (
                  <Text style={styles.eduMeta}>{edu.details}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* ================= CERTIFICATIONS ================= */}
        {certifications.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle>Certifications</SectionTitle>
            {certifications.map((c, i) => (
              <Text key={i} style={styles.certLine}>
                {[c.name, c.issuer, c.year].filter(Boolean).join(" · ")}
              </Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
