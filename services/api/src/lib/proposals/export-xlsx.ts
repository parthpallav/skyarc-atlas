import { buildZip } from "./zip-store.js";
import type { ProposalSnapshot } from "./proposal.js";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sheetXml(rows: string[][]): string {
  const cells = rows
    .map((row, r) => {
      const c = row
        .map((val, i) => {
          const col = String.fromCharCode(65 + i);
          const ref = `${col}${r + 1}`;
          const isNum = val !== "" && !Number.isNaN(Number(val)) && /^-?\d+(\.\d+)?$/.test(val);
          if (isNum) return `<c r="${ref}"><v>${val}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(val)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${c}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`;
}

export function buildProposalXlsx(snapshot: ProposalSnapshot): Buffer {
  const summary = [
    ["Field", "Value"],
    ["Campaign", snapshot.campaignName],
    ["Advertiser", snapshot.advertiserName],
    ["Scenario", snapshot.scenarioKind],
    ["Strategy", snapshot.strategySummary],
    ["Flight start", snapshot.flight.start ?? ""],
    ["Flight end", snapshot.flight.end ?? ""],
    ["Currency", snapshot.currency],
    ["Total", String(snapshot.totalCost)],
  ];
  const sites = [
    ["Site code", "Name", "Road", "Format", "Flight cost", "Freshness", "Reason"],
    ...snapshot.lines.map((l) => [
      l.skyarcSiteCode ?? "",
      l.locationName,
      l.road ?? "",
      l.inventoryType ?? "",
      String(l.flightCost),
      l.availabilityFreshness,
      l.reason,
    ]),
  ];

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Summary" sheetId="1" r:id="rId1"/>
    <sheet name="Sites" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`;

  return buildZip([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes) },
    { name: "_rels/.rels", data: Buffer.from(rels) },
    { name: "xl/workbook.xml", data: Buffer.from(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(wbRels) },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml(summary)) },
    { name: "xl/worksheets/sheet2.xml", data: Buffer.from(sheetXml(sites)) },
  ]);
}
