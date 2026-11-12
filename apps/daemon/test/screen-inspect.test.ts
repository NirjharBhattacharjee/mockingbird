import { describe, expect, test } from "bun:test";
import { hasEncodedPixelCoordinates, type VideoGeometry } from "@mockingbird/video";
import { privacyRows } from "../src/screen-inspection/ocr-rows.ts";

const geometry: VideoGeometry = {
  encoded: { width: 100, height: 80 },
  sampleAspectRatio: "1:1",
  rotationTags: [],
  displayMatrices: [],
};
const identity = "00000000: 65536 0 0\n00000001: 0 65536 0\n00000002: 0 0 1073741824";

describe("inspection geometry", () => {
  test("accepts only known square, untransformed pixels", () => {
    expect(hasEncodedPixelCoordinates(geometry)).toBe(true);
    expect(hasEncodedPixelCoordinates({ ...geometry, sampleAspectRatio: "2:2" })).toBe(true);
    expect(
      hasEncodedPixelCoordinates({
        ...geometry,
        displayMatrices: [{ rotation: 0, matrix: identity }],
      }),
    ).toBe(true);
    for (const invalid of [
      { ...geometry, sampleAspectRatio: "4:3" },
      { ...geometry, sampleAspectRatio: null },
      { ...geometry, sampleAspectRatio: "0:1" },
      { ...geometry, rotationTags: ["90"] },
      { ...geometry, rotationTags: ["0", "90"] },
      { ...geometry, rotationTags: ["unknown"] },
      { ...geometry, displayMatrices: [{ rotation: 90, matrix: identity }] },
      {
        ...geometry,
        displayMatrices: [{ rotation: 0, matrix: identity.replace("65536", "-65536") }],
      },
      { ...geometry, displayMatrices: [{ rotation: 0, matrix: null }] },
    ])
      expect(hasEncodedPixelCoordinates(invalid)).toBe(false);
  });
});

function row(
  line: number,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  confidence = 90,
) {
  return [5, 1, 1, 1, line, 1, x, y, w, h, confidence, text].join("\t");
}

describe("privacy OCR row classification", () => {
  test("groups words into clipped row rectangles without returning their text", () => {
    const tsv = [
      "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
      row(1, 2, 4, 16, 8, "Contact:"),
      row(1, 20, 4, 100, 8, "alice@example.com"),
      row(2, 5, 25, 25, 10, "File:"),
      row(2, 31, 25, 60, 10, "/work/report.pdf"),
      row(3, 4, 40, 20, 9, "Morgan"),
      row(3, 26, 40, 20, 9, "SMITH"),
      row(4, 2, 55, 15, 9, "ordinary"),
      row(5, 0, 70, 10, 9, "hidden@example.com", -1),
      row(6, 105, 70, 10, 9, "outside@example.com"),
      "5\tmalformed",
    ].join("\n");
    const findings = privacyRows(tsv, ["morgan smith"], 100, 80);
    expect(findings).toEqual([
      { types: ["email"], rect: { x: 2, y: 4, w: 98, h: 8 } },
      { types: ["file_path"], rect: { x: 5, y: 25, w: 86, h: 10 } },
      { types: ["supplied_name"], rect: { x: 4, y: 40, w: 42, h: 9 } },
    ]);
    expect(JSON.stringify(findings)).not.toContain("alice@example.com");
    expect(JSON.stringify(findings)).not.toContain("Morgan");
  });
});
