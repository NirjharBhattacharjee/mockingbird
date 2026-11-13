import type { VideoSource } from "./source.ts";

export type Rational = { n: bigint; d: bigint };
export type FrameSample = {
  requested: number;
  selected: number;
  pts: number;
  ptsTicks: string;
  index: number;
};

export function requireFrameData<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Screen inspection returned incomplete frame data.");
  return value;
}

export function decimalRational(value: number): Rational {
  const [coefficient = "0", exponent = "0"] = String(value).toLowerCase().split("e");
  const [whole = "0", fraction = ""] = coefficient.split(".");
  const power = Number(exponent) - fraction.length;
  const n = BigInt(whole + fraction);
  return power >= 0 ? { n: n * 10n ** BigInt(power), d: 1n } : { n, d: 10n ** BigInt(-power) };
}
export const addRationals = (a: Rational, b: Rational): Rational => ({
  n: a.n * b.d + b.n * a.d,
  d: a.d * b.d,
});
export const compareRationals = (a: Rational, b: Rational) => a.n * b.d - b.n * a.d;
export const rationalToNumber = (a: Rational) => Number(a.n) / Number(a.d);

export function parseTimeBase(value: string | undefined): Rational | undefined {
  if (!value || !/^\d{1,12}\/\d{1,12}$/.test(value)) return undefined;
  const [n = "0", d = "0"] = value.split("/");
  return BigInt(n) > 0n && BigInt(d) > 0n ? { n: BigInt(n), d: BigInt(d) } : undefined;
}

export function ticksToTime(ticks: bigint, base: Rational): Rational {
  return { n: ticks * base.n, d: base.d };
}

export function sampleFramesAt(source: VideoSource, times: number[]): FrameSample[] {
  return times.map((requested) => {
    if (requested >= source.duration)
      throw new Error(`Requested time ${requested}s is outside the ${source.duration}s video.`);
    const target = addRationals(source.originExact, decimalRational(requested));
    let low = 0;
    let high = source.ticks.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (
        compareRationals(
          ticksToTime(requireFrameData(source.ticks[mid]), source.timeBase),
          target,
        ) <= 0n
      )
        low = mid + 1;
      else high = mid;
    }
    if (low === 0) throw new Error(`No video frame is displayed at ${requested}s.`);
    const index = low - 1;
    const exact = ticksToTime(requireFrameData(source.ticks[index]), source.timeBase);
    const selected = rationalToNumber({
      n: exact.n * source.originExact.d - source.originExact.n * exact.d,
      d: exact.d * source.originExact.d,
    });
    return {
      requested,
      selected,
      pts: rationalToNumber(exact),
      ptsTicks: String(source.ticks[index]),
      index,
    };
  });
}
