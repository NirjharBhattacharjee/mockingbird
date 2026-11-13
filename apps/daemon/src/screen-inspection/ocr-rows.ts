type OcrRow = { text: string; x: number; y: number; right: number; bottom: number };
export function privacyRows(tsv: string, names: string[], width: number, height: number) {
  const rows = new Map<string, OcrRow>();
  for (const line of tsv.split("\n").slice(1)) {
    const c = line.split("\t");
    const confidence = Number(c[10]);
    if (
      c.length < 12 ||
      c[0] !== "5" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      !c[11]?.trim()
    )
      continue;
    const [x, y, w, h] = c.slice(6, 10).map(Number);
    if (
      ![x, y, w, h].every(Number.isFinite) ||
      x === undefined ||
      y === undefined ||
      w === undefined ||
      h === undefined ||
      x < 0 ||
      y < 0 ||
      x >= width ||
      y >= height ||
      w <= 0 ||
      h <= 0
    )
      continue;
    const right = Math.min(width, x + w);
    const bottom = Math.min(height, y + h);
    const key = c.slice(1, 5).join(":");
    const row = rows.get(key) ?? { text: "", x, y, right, bottom };
    row.text += `${row.text ? " " : ""}${c.slice(11).join("\t")}`;
    row.x = Math.min(row.x, x);
    row.y = Math.min(row.y, y);
    row.right = Math.max(row.right, right);
    row.bottom = Math.max(row.bottom, bottom);
    rows.set(key, row);
  }
  return [...rows.values()].flatMap((row) => {
    const types = [];
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(row.text)) types.push("email");
    if (
      /(?:^|[\s:(])(?:\/(?:[^\s/]+\/)*[^\s/]+|~\/\S+|\.{1,2}\/\S+|[A-Z]:[\\/]\S+|\\\\\S+\\\S+)/i.test(
        row.text,
      )
    )
      types.push("file_path");
    if (names.some((name) => row.text.toLocaleLowerCase().includes(name.toLocaleLowerCase())))
      types.push("supplied_name");
    return types.length
      ? [{ types, rect: { x: row.x, y: row.y, w: row.right - row.x, h: row.bottom - row.y } }]
      : [];
  });
}
