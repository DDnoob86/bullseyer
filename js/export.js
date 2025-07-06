import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.mini.min.js';

export function exportGameDay(gameDay, matches) {
  const wb = XLSX.utils.book_new();
  const rows = matches.flatMap(m => m.legs.map(l => ({
    Datum: gameDay.date,
    Board: m.board,
    SpielerA: m.p1.name,
    SpielerB: m.p2.name,
    LegNr: l.no,
    Sieger: l.winner.name,
    Darts: l.dartsCount,
    "Ø 3": l.avg3,
    "High Finish": l.highFinish,
    "Bull": l.bullFin ? '✓' : '',
    "180": l._180 ? '✓' : '',
    ShortGame: l.dartsCount < 18 ? '✓' : ''
  })));
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, gameDay.label);
  XLSX.writeFile(wb, `Spieltag_${gameDay.label}.xlsx`);
}