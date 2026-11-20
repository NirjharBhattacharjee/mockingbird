/**
 * Subject mattes (#260): MODNet, a portrait matting model, on onnxruntime.
 * Given a frame's RGB, it says how much of each pixel is the person, 0-255.
 * It knows nothing about video: the engine feeds it frames.
 */
import * as ort from "onnxruntime-node";

/**
 * The size MODNet reads a `width`x`height` frame at: the shortest side 512
 * and both sides a multiple of 32, the shape it was trained on.
 */
export function matteSize(width: number, height: number): { width: number; height: number } {
  const k = 512 / Math.min(width, height);
  const to32 = (n: number) => Math.max(32, Math.round((n * k) / 32) * 32);
  return { width: to32(width), height: to32(height) };
}

export class SubjectMatte {
  private constructor(private readonly session: ort.InferenceSession) {}

  static async load(modelPath: string): Promise<SubjectMatte> {
    return new SubjectMatte(await ort.InferenceSession.create(modelPath));
  }

  /** The matte of one frame: `rgb` is `width`x`height` RGB24 at matteSize. One byte a pixel back. */
  async matte(rgb: Uint8Array, width: number, height: number): Promise<Uint8Array> {
    const plane = width * height;
    // NCHW, each channel scaled to -1..1 (mean 0.5, std 0.5).
    const input = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i++) {
      for (let c = 0; c < 3; c++) input[c * plane + i] = (rgb[i * 3 + c] as number) / 127.5 - 1;
    }
    const name = this.session.inputNames[0] as string;
    const out = await this.session.run({
      [name]: new ort.Tensor("float32", input, [1, 3, height, width]),
    });
    const alpha = out[this.session.outputNames[0] as string]?.data as Float32Array;
    const bytes = new Uint8Array(plane);
    for (let i = 0; i < plane; i++) {
      bytes[i] = Math.round(Math.min(1, Math.max(0, alpha[i] as number)) * 255);
    }
    return bytes;
  }
}
