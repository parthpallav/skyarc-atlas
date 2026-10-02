import { buildZip } from "./zip-store.js";
import type { ProposalSnapshot } from "./proposal.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slideXml(title: string, bullets: string[]): string {
  const texts = [
    `<a:p><a:r><a:rPr lang="en-US" sz="2800" b="1"/><a:t>${esc(title)}</a:t></a:r></a:p>`,
    ...bullets.map(
      (b) =>
        `<a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>${esc(b)}</a:t></a:r></a:p>`
    ),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="5486400"/></a:xfrm>
        </p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/>${texts}</p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

/** Build a minimal customer-safe PPTX from an issued proposal snapshot. */
export function buildProposalPptx(snapshot: ProposalSnapshot): Buffer {
  const slides = [
    slideXml(snapshot.campaignName, [
      snapshot.advertiserName,
      `Scenario: ${snapshot.scenarioKind}`,
      snapshot.strategySummary,
      `Flight: ${snapshot.flight.start?.slice(0, 10) ?? "—"} → ${snapshot.flight.end?.slice(0, 10) ?? "—"}`,
      `Total: ${snapshot.currency} ${snapshot.totalCost.toLocaleString("en-IN")}`,
    ]),
    slideXml("Selected inventory", [
      ...snapshot.lines.slice(0, 8).map(
        (l) =>
          `${l.skyarcSiteCode ?? l.locationName} · ${l.inventoryType ?? "format"} · ₹${l.flightCost.toLocaleString("en-IN")}`
      ),
      snapshot.lines.length > 8 ? `…and ${snapshot.lines.length - 8} more sites` : "",
    ].filter(Boolean)),
    slideXml("Trade-offs & next steps", [
      ...snapshot.tradeOffs,
      "Next: review proposal → accept to reserve capacity",
      ...snapshot.evidenceLimitations.slice(0, 2),
    ]),
  ];

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("\n")}
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

  const presentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    ${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("\n")}
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`;

  const presRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("\n")}
</Relationships>`;

  const entries = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes) },
    { name: "_rels/.rels", data: Buffer.from(rels) },
    { name: "ppt/presentation.xml", data: Buffer.from(presentation) },
    { name: "ppt/_rels/presentation.xml.rels", data: Buffer.from(presRels) },
    ...slides.map((xml, i) => ({
      name: `ppt/slides/slide${i + 1}.xml`,
      data: Buffer.from(xml),
    })),
  ];
  return buildZip(entries);
}

/** Lightweight structural validation for QA. */
export function inspectPptxSlides(buf: Buffer): { slideCount: number; hasCampaignName: boolean } {
  const text = buf.toString("binary");
  const names = new Set(text.match(/ppt\/slides\/slide\d+\.xml/g) ?? []);
  return { slideCount: names.size, hasCampaignName: names.size >= 3 };
}
