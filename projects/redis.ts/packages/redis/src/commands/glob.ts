//! Redis glob matching for pattern subscriptions and key scans.

/**
 * Matches `key` bytes against the Redis glob dialect `*`, `?`, `[...]` classes and
 * backslash escapes.
 *
 * A class may be negated with `[^...]` and hold `a-z` ranges, mirroring the gateway
 * `stringmatchlen` rules byte for byte.
 */
export function globMatch(pattern: Buffer, key: Buffer): boolean {
    let patternIndex = 0;
    let keyIndex = 0;
    let star = -1;
    let resume = 0;
    while (keyIndex < key.length) {
        if (patternIndex < pattern.length) {
            const current = pattern[patternIndex];
            if (current === 0x3f) {
                patternIndex += 1;
                keyIndex += 1;
                continue;
            }
            if (current === 0x2a) {
                star = patternIndex;
                patternIndex += 1;
                resume = keyIndex;
                continue;
            }
            if (current === 0x5b) {
                const matched = classMatch(pattern, patternIndex, key[keyIndex]);
                if (matched[1]) {
                    patternIndex = matched[0];
                    keyIndex += 1;
                    continue;
                }
            }
            if (current === 0x5c && patternIndex + 1 < pattern.length && pattern[patternIndex + 1] === key[keyIndex]) {
                patternIndex += 2;
                keyIndex += 1;
                continue;
            }
            if (current === key[keyIndex]) {
                patternIndex += 1;
                keyIndex += 1;
                continue;
            }
        }
        if (star >= 0) {
            patternIndex = star + 1;
            resume += 1;
            keyIndex = resume;
            continue;
        }
        return false;
    }
    while (patternIndex < pattern.length && pattern[patternIndex] === 0x2a) {
        patternIndex += 1;
    }
    return patternIndex === pattern.length;
}

/**
 * Matches one `[...]` class starting at `start`, returning the index past its `]` and
 * whether `byte` hit it. An unterminated class ends with the pattern, like Redis.
 */
function classMatch(pattern: Buffer, start: number, byte: number): [number, boolean] {
    let index = start + 1;
    const negated = pattern[index] === 0x5e;
    if (negated) index += 1;
    let matched = false;
    while (index < pattern.length) {
        if (pattern[index] === 0x5d) {
            index += 1;
            break;
        }
        if (pattern[index] === 0x5c && index + 1 < pattern.length) {
            if (pattern[index + 1] === byte) matched = true;
            index += 2;
            continue;
        }
        if (index + 2 < pattern.length && pattern[index + 1] === 0x2d) {
            let low = pattern[index];
            let high = pattern[index + 2];
            if (low > high) [low, high] = [high, low];
            if (byte >= low && byte <= high) matched = true;
            index += 3;
            continue;
        }
        if (pattern[index] === byte) matched = true;
        index += 1;
    }
    // Redis ends an unterminated class at the end of the pattern, so
    // `ks:user:[1` still matches `ks:user:1`.
    return [index, negated ? !matched : matched];
}
