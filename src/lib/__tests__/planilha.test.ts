import { describe, expect, it } from 'vitest';
import { fichaSheet, fichasFileName, SHEET_HEADER, type FichaForSheet } from '../fichasSheet';
import { columnName, sheetNames, xlsxBytes } from '../xlsx';
import { crc32, unzipStore, zipStore } from '../zip';

const enc = new TextEncoder();
const dec = new TextDecoder();

const EX = new Map([
  ['supino-reto-barra', { name: 'Supino reto com barra', measure: 'weight_reps' as const }],
  ['crucifixo-halteres', { name: 'Crucifixo com halteres', measure: 'weight_reps' as const }],
  ['triceps-corda', { name: 'Tríceps na polia com corda', measure: 'weight_reps' as const }],
  ['prancha', { name: 'Prancha', measure: 'time' as const }],
]);

const item = (over: Partial<FichaForSheet['items'][number]>): FichaForSheet['items'][number] => ({
  position: 0,
  exercise_id: 'supino-reto-barra',
  sets: 3,
  target_min: 8,
  target_max: 12,
  rest_sec: 90,
  warmup_sets: 0,
  note: null,
  superset: null,
  ...over,
});

const FICHA: FichaForSheet = {
  routine: { name: 'Ficha A: Peito e tríceps' },
  items: [
    item({ position: 3, exercise_id: 'prancha', target_min: 30, target_max: 45, rest_sec: 60 }),
    item({ position: 0, warmup_sets: 2, rest_sec: 120 }),
    item({
      position: 1,
      exercise_id: 'crucifixo-halteres',
      superset: 's1',
      note: 'Cotovelo macio',
    }),
    item({
      position: 2,
      exercise_id: 'triceps-corda',
      superset: 's1',
      target_min: 12,
      target_max: 12,
      rest_sec: 75,
    }),
  ],
};

describe('zip', () => {
  it('crc32 of a known text', () => {
    expect(crc32(enc.encode('123456789')).toString(16)).toBe('cbf43926');
  });

  it('what goes in comes back, with names in UTF-8', () => {
    const zip = zipStore([
      { name: 'a.txt', data: enc.encode('olá') },
      { name: 'pasta/séries.xml', data: enc.encode('<x/>') },
    ]);
    expect(dec.decode(zip.subarray(0, 2))).toBe('PK');
    const back = unzipStore(zip);
    expect([...back.keys()]).toEqual(['a.txt', 'pasta/séries.xml']);
    expect(dec.decode(back.get('a.txt'))).toBe('olá');
  });
});

describe('planilha das fichas', () => {
  it('uma linha por exercício, na ordem da ficha', () => {
    const s = fichaSheet(FICHA, EX, '2026-10-20');
    expect(s.rows[0]).toEqual({ cells: ['Ficha A: Peito e tríceps'], style: 'title' });
    expect(s.rows[1]?.cells[0]).toMatch(/^Exportado do Anilha em 20\/10\/2026\./);
    expect(s.rows[3]).toEqual({ cells: SHEET_HEADER, style: 'header' });
    const body = s.rows.slice(4).map((r) => r.cells.slice(0, 7));
    expect(body).toEqual([
      [1, 'Supino reto com barra', 3, '8 a 12', '2 min', '2 séries', null],
      [
        2,
        'Crucifixo com halteres',
        3,
        '8 a 12',
        '1 min 30 s',
        null,
        'Bi-set com Tríceps na polia com corda: alterne as séries, descanso depois do par. Cotovelo macio',
      ],
      [
        3,
        'Tríceps na polia com corda',
        3,
        '12',
        '75 s',
        null,
        'Bi-set com Crucifixo com halteres: alterne as séries, descanso depois do par',
      ],
      [4, 'Prancha', 3, '30 a 45 s', '1 min', null, null],
    ]);
    // Four empty weeks to write the load.
    expect(s.rows[4]?.cells.slice(7)).toEqual([null, null, null, null]);
    expect(SHEET_HEADER.slice(7)).toEqual(['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4']);
  });

  it('o arquivo é um xlsx com uma aba por ficha', () => {
    const other: FichaForSheet = { routine: { name: 'Costa & bíceps <leve>' }, items: [item({})] };
    const files = unzipStore(
      xlsxBytes([fichaSheet(FICHA, EX, '2026-10-20'), fichaSheet(other, EX, '2026-10-20')]),
    );
    // As partes que o próprio Excel grava: o iPhone (Numbers e a prévia de Arquivos) não
    // lia texto em linha, só a tabela de textos compartilhada.
    expect([...files.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'docProps/app.xml',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
      'xl/styles.xml',
      'xl/sharedStrings.xml',
    ]);
    const workbook = dec.decode(files.get('xl/workbook.xml'));
    expect(workbook).toContain('<sheet name="Ficha A Peito e tríceps" sheetId="1" r:id="rId1"/>');
    expect(workbook).toContain('<sheet name="Costa &amp; bíceps &lt;leve&gt;" sheetId="2"');
    const sheet = dec.decode(files.get('xl/worksheets/sheet1.xml'));
    expect(sheet).not.toContain('inlineStr');
    expect(sheet).toContain('<dimension ref="A1:K8"/>');
    expect(sheet).toContain('<c r="C5" s="4"><v>3</v></c>');
    expect(sheet).toContain('<pane ySplit="4" topLeftCell="A5"');
    const sst = dec.decode(files.get('xl/sharedStrings.xml'));
    const strings = [...sst.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((m) => m[1]);
    // A célula B5 aponta para o nome do supino na tabela.
    const b5 = /<c r="B5" s="4" t="s"><v>(\d+)<\/v><\/c>/.exec(sheet)?.[1];
    expect(strings[Number(b5)]).toBe('Supino reto com barra');
    expect(new Set(strings).size).toBe(strings.length);
    expect(dec.decode(files.get('_rels/.rels'))).toContain('Target="docProps/core.xml"');
    // Every part is XML.
    for (const [name, data] of files) expect(dec.decode(data), name).toMatch(/^<\?xml /);
  });

  it('nomes de aba válidos e sem repetir', () => {
    expect(sheetNames(['Ficha A: Peito', 'Ficha A: Peito', 'x'.repeat(40), '[]'])).toEqual([
      'Ficha A Peito',
      'Ficha A Peito (2)',
      'x'.repeat(31),
      'Ficha',
    ]);
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
  });

  it('nome do arquivo', () => {
    expect(fichasFileName([FICHA], '2026-10-20')).toBe('anilha-ficha-a-peito-e-triceps.xlsx');
    expect(fichasFileName([FICHA, FICHA], '2026-10-20')).toBe('anilha-fichas-2026-10-20.xlsx');
  });
});
