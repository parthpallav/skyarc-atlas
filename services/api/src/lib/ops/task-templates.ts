/**
 * Static vs digital execution task templates.
 * Confirming a booking seeds these — it does NOT mark the campaign live.
 */

export type TaskTemplateStep = {
  kind:
    | "CREATIVE_SUBMISSION"
    | "CREATIVE_APPROVAL"
    | "PRODUCTION"
    | "MOUNTING"
    | "CONTENT_UPLOAD"
    | "LAUNCH_VERIFICATION"
    | "MONITORING"
    | "ISSUE_RESOLUTION"
    | "REMOVAL"
    | "CLOSURE";
  title: string;
  checklist: string[];
  dueOffsetDays: number;
};

export function isDigitalInventoryType(inventoryType: string | null | undefined): boolean {
  const t = (inventoryType ?? "").toUpperCase();
  return t.includes("DIGITAL") || t.includes("LED") || t.includes("DOOH") || t === "SCREEN";
}

export function templateKeyForInventory(inventoryType: string | null | undefined): "static.v1" | "digital.v1" {
  return isDigitalInventoryType(inventoryType) ? "digital.v1" : "static.v1";
}

export function stepsForTemplate(templateKey: "static.v1" | "digital.v1"): TaskTemplateStep[] {
  const creative: TaskTemplateStep[] = [
    {
      kind: "CREATIVE_SUBMISSION",
      title: "Submit creative",
      checklist: ["Asset uploaded", "Specs match inventory"],
      dueOffsetDays: 3,
    },
    {
      kind: "CREATIVE_APPROVAL",
      title: "Approve creative",
      checklist: ["Brand approved", "Legal reviewed"],
      dueOffsetDays: 5,
    },
  ];

  const mid: TaskTemplateStep[] =
    templateKey === "digital.v1"
      ? [
          {
            kind: "CONTENT_UPLOAD",
            title: "CMS handoff (manual)",
            checklist: ["File delivered to CMS operator", "Handoff logged — not auto-scheduled"],
            dueOffsetDays: 7,
          },
        ]
      : [
          {
            kind: "PRODUCTION",
            title: "Print / production",
            checklist: ["Artwork approved for print", "Vendor PO confirmed"],
            dueOffsetDays: 7,
          },
          {
            kind: "MOUNTING",
            title: "Mount / install",
            checklist: ["Site access confirmed", "Install complete"],
            dueOffsetDays: 10,
          },
        ];

  const tail: TaskTemplateStep[] = [
    {
      kind: "LAUNCH_VERIFICATION",
      title: "Launch verification",
      checklist: ["On-site check", "Launch evidence captured"],
      dueOffsetDays: 12,
    },
    {
      kind: "MONITORING",
      title: "Flight monitoring",
      checklist: ["Issues logged", "Open issues resolved or escalated"],
      dueOffsetDays: 20,
    },
    {
      kind: "ISSUE_RESOLUTION",
      title: "Issue resolution",
      checklist: ["Root cause noted", "Fix verified"],
      dueOffsetDays: 25,
    },
    {
      kind: "REMOVAL",
      title: "Removal",
      checklist: ["Creative removed / playlist cleared"],
      dueOffsetDays: 35,
    },
    {
      kind: "CLOSURE",
      title: "Campaign closure",
      checklist: ["Proof archive complete", "Billing handoff"],
      dueOffsetDays: 40,
    },
  ];

  return [...creative, ...mid, ...tail];
}
