import { zipStore } from './zip';

/**
 * A small Excel workbook (.xlsx) written by hand: text and numbers, a few row styles, column
 * widths, the header frozen and the page in landscape. Same parts the Excel app itself saves
 * (shared string table, document properties, sheet dimensions): the first version used inline
 * strings, which Excel and Google Sheets read but the iPhone (Numbers, Files preview) did not.
 */

export type Cell = string | number | null;
export type RowStyle = 'title' | 'muted' | 'header' | 'body';

export interface SheetSpec {
  name: string;
  rows: { cells: Cell[]; style?: RowStyle }[];
  /** Width of each column, in characters. */
  widths: number[];
  /** Rows above this one stay in place when scrolling. */
  freezeRows?: number;
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const STYLE_ID: Record<RowStyle, number> = { title: 1, muted: 2, header: 3, body: 4 };
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

function esc(s: string): string {
  return (
    s
      // Control characters are not allowed in XML.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}

export function columnName(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Sheet names: up to 31 characters, none of []:*?/\, and no two the same. */
export function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const base =
      raw
        .replace(/[[\]:*?/\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 31)
        .trim() || 'Ficha';
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) {
      const tail = ` (${n})`;
      name = base.slice(0, 31 - tail.length).trim() + tail;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** Shared string table: each distinct text once, cells point to it by index. */
class Strings {
  list: string[] = [];
  private index = new Map<string, number>();
  count = 0;
  id(s: string): number {
    this.count += 1;
    const hit = this.index.get(s);
    if (hit !== undefined) return hit;
    const i = this.list.length;
    this.list.push(s);
    this.index.set(s, i);
    return i;
  }
}

function sheetXml(s: SheetSpec, strings: Strings): string {
  const width = Math.max(1, s.widths.length, ...s.rows.map((r) => r.cells.length));
  const rows = s.rows
    .map((row, r) => {
      const style = row.style ? ` s="${STYLE_ID[row.style]}"` : '';
      const cells = row.cells
        .map((v, c) => {
          const ref = `${columnName(c)}${r + 1}`;
          if (v === null || v === '') return row.style ? `<c r="${ref}"${style}/>` : '';
          if (typeof v === 'number') return `<c r="${ref}"${style}><v>${v}</v></c>`;
          return `<c r="${ref}"${style} t="s"><v>${strings.id(v)}</v></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const cols = s.widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const freeze = s.freezeRows
    ? `<pane ySplit="${s.freezeRows}" topLeftCell="A${s.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  return (
    XML +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:${columnName(width - 1)}${Math.max(1, s.rows.length)}"/>` +
    `<sheetViews><sheetView workbookViewId="0">${freeze}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${cols}</cols>` +
    `<sheetData>${rows}</sheetData>` +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>'
  );
}

const STYLES =
  XML +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<fonts count="4">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><sz val="10"/><color rgb="FF757577"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F4F5"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FFE4E4E7"/></left><right style="thin"><color rgb="FFE4E4E7"/></right>' +
  '<top style="thin"><color rgb="FFE4E4E7"/></top><bottom style="thin"><color rgb="FFE4E4E7"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/** `created`: ISO date-time for the document properties (the export moment). */
export function xlsxBytes(sheets: SheetSpec[], created = '2026-01-01T00:00:00Z'): Uint8Array {
  const enc = new TextEncoder();
  const names = sheetNames(sheets.map((s) => s.name));
  const n = sheets.length;
  const strings = new Strings();
  const sheetFiles = sheets.map((s, i) => ({
    name: `xl/worksheets/sheet${i + 1}.xml`,
    data: sheetXml(s, strings),
  }));
  const files: { name: string; data: string }[] = [
    {
      name: '[Content_Types].xml',
      data:
        XML +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      data:
        XML +
        `<Relationships xmlns="${NS_PKG_REL}">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'docProps/core.xml',
      data:
        XML +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>Fichas do Anilha</dc:title><dc:creator>Anilha</dc:creator>' +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>` +
        `<dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>` +
        '</cp:coreProperties>',
    },
    {
      name: 'docProps/app.xml',
      data:
        XML +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
        '<Application>Anilha</Application>' +
        `<TitlesOfParts><vt:vector size="${n}" baseType="lpstr">${names.map((nm) => `<vt:lpstr>${esc(nm)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts>` +
        '</Properties>',
    },
    {
      name: 'xl/workbook.xml',
      data:
        XML +
        `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
        '<bookViews><workbookView activeTab="0"/></bookViews>' +
        `<sheets>${names.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        '</workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data:
        XML +
        `<Relationships xmlns="${NS_PKG_REL}">` +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
        '</Relationships>',
    },
    ...sheetFiles,
    { name: 'xl/styles.xml', data: STYLES },
    {
      name: 'xl/sharedStrings.xml',
      data:
        XML +
        `<sst xmlns="${NS_MAIN}" count="${strings.count}" uniqueCount="${strings.list.length}">` +
        strings.list.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') +
        '</sst>',
    },
  ];
  return zipStore(files.map((f) => ({ name: f.name, data: enc.encode(f.data) })));
}

export function xlsxBlob(sheets: SheetSpec[], created?: string): Blob {
  return new Blob([xlsxBytes(sheets, created) as BlobPart], { type: XLSX_TYPE });
}
