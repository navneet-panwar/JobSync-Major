import { Badge } from "@/components/ui/Badge";

/**
 * The placement-cell status vocabulary, in one place.
 *
 * Colour follows meaning, not decoration: `critical` and `needs_improvement`
 * are the only ones a cell should feel urgency about, so they are the only ones
 * that get the warning/danger tones.
 */
export const PLACEMENT_STATUSES = [
  { value: "not_reviewed", label: "Not reviewed", tone: "neutral" },
  { value: "referred", label: "Referred", tone: "accent" },
  { value: "shortlisted", label: "Shortlisted", tone: "success" },
  { value: "hired", label: "Hired", tone: "success" },
  { value: "needs_improvement", label: "Needs improvement", tone: "warning" },
  { value: "critical", label: "Critical", tone: "danger" },
];

const BY_VALUE = new Map(PLACEMENT_STATUSES.map((s) => [s.value, s]));

export function placementStatusMeta(value) {
  return BY_VALUE.get(value) || BY_VALUE.get("not_reviewed");
}

export function PlacementStatusBadge({ status, className }) {
  const meta = placementStatusMeta(status);
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

/** Readiness banding, mirrored from the server so colours match everywhere. */
export function readinessTone(score) {
  if (score == null) return "neutral";
  if (score >= 80) return "success";
  if (score >= 65) return "accent";
  if (score >= 45) return "warning";
  return "danger";
}

export default PlacementStatusBadge;
