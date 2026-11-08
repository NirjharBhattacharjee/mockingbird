import { expect, test } from "bun:test";

test("renderHtml refuses a tab count that isn't a whole number from 1, before starting Chrome", async () => {
  const { renderHtml } = await import("../src/html.ts");
  const options = {
    chrome: "/no/chrome",
    out: "/tmp/x.mp4",
    width: 32,
    height: 32,
    fps: 10,
    duration: 1,
  };
  for (const tabs of [0, -1, 1.5, Number.NaN]) {
    await expect(renderHtml("/no/page.html", { ...options, tabs })).rejects.toThrow("tabs must be");
  }
});

test("jpegs splits an MJPEG stream at each end-of-image marker, across chunks", async () => {
  const { jpegs } = await import("../src/html.ts");
  const a = [0xff, 0xd8, 1, 0xff, 0x00, 2, 0xff, 0xd9];
  const b = [0xff, 0xd8, 3, 0xff, 0xd9];
  const bytes = Uint8Array.from([...a, ...b]);
  // Cut between the 0xFF and 0xD9 of the first marker.
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes.subarray(0, 7));
      c.enqueue(bytes.subarray(7));
      c.close();
    },
  });
  const got: number[][] = [];
  for await (const j of jpegs(stream)) got.push([...j]);
  expect(got).toEqual([a, b]);
});
