//! Exact x87 `long double` arithmetic behind `HINCRBYFLOAT`.

import { text } from './kinds.js';

/**
 * Parses one float the way `INCRBYFLOAT` reads it.
 *
 * Decimal literals and the infinity words are accepted, `NaN` is returned as a
 * number so the caller can reject it, and anything else answers `null`.
 */
export function parseFloatText(raw: Buffer | string): number | null {
    const value = text(raw);
    if (/^[+-]?(?:inf(?:inity)?|nan)$/i.test(value)) {
        if (/nan/i.test(value)) return NaN;
        return value.startsWith('-') ? -Infinity : Infinity;
    }
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
        return null;
    }
    return Number(value);
}

/** Decimal places the server prints for `HINCRBYFLOAT` results. */
const LONG_DOUBLE_PLACES = 10n ** 17n;
/** Significand width and exponent window of the x87 `long double` the server uses. */
const LONG_DOUBLE_BITS = 64;
const LONG_DOUBLE_MAX_EXPONENT = 16320;
const LONG_DOUBLE_MIN_EXPONENT = -16508;

/** One reader value: `{inf}` a signed infinity, `{nan}` a NaN, or `±m * 2^e`. */
export interface LongDouble {
    inf?: number;
    nan?: boolean;
    m?: bigint;
    e?: number;
    negative?: boolean;
}

/** Bit count of a non-negative BigInt. */
function bitLengthOf(value: bigint): number {
    return value === 0n ? 0 : value.toString(2).length;
}

/** Divides two BigInts, rounding halves to the even neighbour. */
function divideHalfEven(numerator: bigint, denominator: bigint): bigint {
    let quotient = numerator / denominator;
    const remainder = numerator % denominator;
    const doubled = remainder * 2n;
    if (doubled > denominator || (doubled === denominator && (quotient & 1n) === 1n)) quotient += 1n;
    return quotient;
}

/** Rounds `magnitude * 2^exponent` down to the 64-bit significand the CPU keeps. */
function roundToLongDouble(magnitude: bigint, exponent: number): { m: bigint; e: number } {
    if (magnitude === 0n) return { m: 0n, e: 0 };
    const bits = bitLengthOf(magnitude);
    if (bits <= LONG_DOUBLE_BITS) return { m: magnitude, e: exponent };
    const shift = BigInt(bits - LONG_DOUBLE_BITS);
    let m = magnitude >> shift;
    const rest = magnitude - (m << shift);
    const halfway = 1n << (shift - 1n);
    if (rest > halfway || (rest === halfway && (m & 1n) === 1n)) m += 1n;
    let e = exponent + Number(shift);
    if (bitLengthOf(m) > LONG_DOUBLE_BITS) {
        m >>= 1n;
        e += 1;
    }
    return { m, e };
}

/**
 * Parses one decimal exactly the way the server's `long double` reader does.
 *
 * `null` is text the reader rejects, `{inf}` a signed infinity, and `{m, e,
 * negative}` the finite value `±m * 2^e` rounded to 64 significand bits.
 */
export function parseLongDouble(raw: Buffer | string): LongDouble | null {
    const value = text(raw);
    if (/^[+-]?(?:inf(?:inity)?)$/i.test(value)) {
        return { inf: value.startsWith('-') ? -1 : 1 };
    }
    const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(value);
    if (match === null) return null;
    const negative = match[1] === '-';
    const fraction = match[3] ?? match[4] ?? '';
    const digits = `${match[2] ?? ''}${fraction}`;
    const magnitude = digits === '' ? 0n : BigInt(digits);
    if (magnitude === 0n) return { m: 0n, e: 0, negative: false };
    const exponent10 = Number(match[5] ?? 0) - fraction.length;
    // The reader overflows past ~1e4932 and underflows below ~1e-4951.
    if (exponent10 + digits.length > 4933) return { inf: negative ? -1 : 1 };
    if (exponent10 + digits.length < -4952) return { m: 0n, e: 0, negative: false };
    const numerator = exponent10 >= 0 ? magnitude * 10n ** BigInt(exponent10) : magnitude;
    const denominator = exponent10 >= 0 ? 1n : 10n ** BigInt(-exponent10);
    let exponent = bitLengthOf(numerator) - bitLengthOf(denominator) - LONG_DOUBLE_BITS;
    let rounded = 0n;
    for (;;) {
        const scaledNumerator = exponent >= 0 ? numerator : numerator << BigInt(-exponent);
        const scaledDenominator = exponent >= 0 ? denominator << BigInt(exponent) : denominator;
        rounded = divideHalfEven(scaledNumerator, scaledDenominator);
        if (rounded >= 1n << 64n) {
            exponent += 1;
            continue;
        }
        if (rounded !== 0n && rounded < 1n << 63n) {
            exponent -= 1;
            continue;
        }
        break;
    }
    if (exponent > LONG_DOUBLE_MAX_EXPONENT) return { inf: negative ? -1 : 1 };
    if (exponent < LONG_DOUBLE_MIN_EXPONENT) return { m: 0n, e: 0, negative: false };
    return { m: rounded, e: exponent, negative };
}

/** Adds two parsed long doubles, answering `{nan}` for infinity minus infinity. */
export function addLongDoubles(left: LongDouble, right: LongDouble): LongDouble {
    const leftInf = left.inf ?? 0;
    const rightInf = right.inf ?? 0;
    if (leftInf !== 0 || rightInf !== 0) {
        if (leftInf !== 0 && rightInf !== 0) return leftInf === rightInf ? { inf: leftInf } : { nan: true };
        return { inf: leftInf !== 0 ? leftInf : rightInf };
    }
    const exponent = Math.min(left.e, right.e);
    const leftScaled = (left.negative ? -1n : 1n) * (left.m << BigInt(left.e - exponent));
    const rightScaled = (right.negative ? -1n : 1n) * (right.m << BigInt(right.e - exponent));
    const sum = leftScaled + rightScaled;
    if (sum === 0n) return { m: 0n, e: 0, negative: false };
    const negative = sum < 0n;
    const rounded = roundToLongDouble(negative ? -sum : sum, exponent);
    if (rounded.e > LONG_DOUBLE_MAX_EXPONENT) return { inf: negative ? -1 : 1 };
    if (rounded.e < LONG_DOUBLE_MIN_EXPONENT) return { m: 0n, e: 0, negative: false };
    return { m: rounded.m, e: rounded.e, negative };
}

/** Renders one long double with the server's `%.17Lf` plus trailing-zero trim. */
export function longDoubleText(value: LongDouble): string {
    if (value.m === 0n) return '0';
    const scaled = value.e >= 0
        ? (value.m << BigInt(value.e)) * LONG_DOUBLE_PLACES
        : divideHalfEven(value.m * LONG_DOUBLE_PLACES, 1n << BigInt(-value.e));
    if (scaled === 0n) return '0';
    const digitsText = String(scaled).padStart(18, '0');
    const whole = digitsText.slice(0, -17);
    const fraction = digitsText.slice(-17).replace(/0+$/, '');
    const body = fraction.length === 0 ? whole : `${whole}.${fraction}`;
    return value.negative ? `-${body}` : body;
}
