/** Minimal PHP `unserialize()` for WordPress meta/option values. Returns the input unchanged when it isn't serialized. */
export const maybeUnserialize = (value: unknown): unknown => {
  if (typeof value !== "string" || !/^(a|O|s|i|d|b):|^N;$/.test(value)) return value;
  try {
    const bytes = Buffer.from(value, "utf8");
    const [result, end] = parse(bytes, 0);
    return end === bytes.length ? result : value;
  } catch {
    return value;
  }
};

const readUntil = (b: Buffer, i: number, ch: string): [string, number] => {
  const end = b.indexOf(ch, i);
  if (end < 0) throw new Error("unterminated");
  return [b.toString("utf8", i, end), end + 1];
};

const parse = (b: Buffer, i: number): [unknown, number] => {
  const type = String.fromCharCode(b[i]);
  if (type === "N") return [null, i + 2];
  if (b[i + 1] !== 0x3a) throw new Error("bad");
  i += 2;
  switch (type) {
    case "i":
    case "d": {
      const [n, next] = readUntil(b, i, ";");
      return [Number(n), next];
    }
    case "b": {
      const [n, next] = readUntil(b, i, ";");
      return [n === "1", next];
    }
    case "s": {
      const [len, next] = readUntil(b, i, ":");
      const start = next + 1;
      const end = start + Number(len);
      return [b.toString("utf8", start, end), end + 2];
    }
    case "a":
    case "O": {
      if (type === "O") {
        const [, afterLen] = readUntil(b, i, ":");
        const [, afterName] = readUntil(b, afterLen, ":");
        i = afterName;
      }
      const [count, next] = readUntil(b, i, ":");
      i = next + 1;
      const entries: Array<[unknown, unknown]> = [];
      for (let n = 0; n < Number(count); n++) {
        const [key, afterKey] = parse(b, i);
        const [val, afterVal] = parse(b, afterKey);
        entries.push([key, val]);
        i = afterVal;
      }
      const isList = type === "a" && entries.every(([k], idx) => k === idx);
      return [isList ? entries.map(([, v]) => v) : Object.fromEntries(entries.map(([k, v]) => [String(k), v])), i + 1];
    }
    default:
      throw new Error(`unsupported type ${type}`);
  }
};
