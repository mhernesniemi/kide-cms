/**
 * Streaming mysqldump reader. Yields one `{ table, columns, rows }` per INSERT
 * statement for the tables `want` accepts; every other statement is skipped
 * without being buffered. Handles extended inserts, multi-line phpMyAdmin
 * exports, `--complete-insert`, comments and .gz input.
 */
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";

export type SqlValue = string | number | null;
export type InsertBatch = { table: string; columns: string[]; rows: SqlValue[][] };

const HEAD_DONE =
  /^(INSERT\s+(?:IGNORE\s+)?INTO|REPLACE\s+INTO|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+`?([^`\s(]+)`?[\s(]/i;
const STATEMENT_HEAD =
  /^\s*(INSERT\s+(?:IGNORE\s+)?INTO|REPLACE\s+INTO|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+`?([^`\s(]+)`?/i;

export async function* readMysqlDump(file: string, want: (table: string) => boolean): AsyncGenerator<InsertBatch> {
  const raw = createReadStream(file);
  const stream = file.endsWith(".gz") ? raw.pipe(createGunzip()) : raw;
  stream.setEncoding("utf8");

  const columns = new Map<string, string[]>();
  let buf: string[] = [];
  let head = "";
  let mode: "head" | "keep" | "skip" = "head";
  let quote = "";
  let escape = false;
  let lineComment = false;
  let blockComment = false;
  let prev = "";

  const finish = (): InsertBatch | null => {
    const text = buf.join("");
    buf = [];
    const keep = mode === "keep";
    mode = "head";
    head = "";
    if (!keep) return null;
    const m = STATEMENT_HEAD.exec(text);
    if (!m) return null;
    const table = m[2];
    if (/^CREATE/i.test(m[1])) {
      columns.set(table, parseCreateColumns(text));
      return null;
    }
    const parsed = parseInsert(text, m.index + m[0].length);
    return { table, columns: parsed.columns ?? columns.get(table) ?? [], rows: parsed.rows };
  };

  for await (const chunk of stream as AsyncIterable<string>) {
    let start = 0;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (lineComment) {
        if (c === "\n") {
          lineComment = false;
          buf = [];
          start = i + 1;
        }
        continue;
      }
      if (blockComment) {
        if (prev === "*" && c === "/") {
          blockComment = false;
          buf = [];
          start = i + 1;
        }
        prev = c;
        continue;
      }
      if (mode === "head" && !(head === "" && /\s/.test(c))) {
        head += c;
        if (head === "--" || head === "#") {
          lineComment = true;
          head = "";
          continue;
        }
        if (head === "/*") {
          blockComment = true;
          head = "";
          prev = "";
          continue;
        }
        const m = HEAD_DONE.exec(head);
        if (m && !/^IF$/i.test(m[2])) mode = want(m[2]) ? "keep" : "skip";
        else if ((head.length >= 8 && !/^(INSERT|REPLACE|CREATE)/i.test(head)) || head.length > 200) mode = "skip";
      }
      if (quote) {
        if (escape) escape = false;
        else if (c === "\\" && quote !== "`") escape = true;
        else if (c === quote) quote = "";
      } else if (c === "'" || c === '"' || c === "`") quote = c;
      else if (c === ";") {
        if (mode !== "skip") buf.push(chunk.slice(start, i));
        start = i + 1;
        const batch = finish();
        if (batch) yield batch;
      }
      prev = c;
    }
    if (mode !== "skip" && !lineComment && !blockComment) buf.push(chunk.slice(start));
  }
  if (buf.join("").trim()) {
    const batch = finish();
    if (batch) yield batch;
  }
}

const parseCreateColumns = (sql: string): string[] => {
  const body = sql.slice(sql.indexOf("(") + 1);
  const cols: string[] = [];
  for (const line of body.split("\n")) {
    const m = /^\s*`([^`]+)`\s+\w/.exec(line);
    if (m) cols.push(m[1]);
  }
  return cols;
};

const ESCAPES: Record<string, string> = { "0": "\0", b: "\b", n: "\n", r: "\r", t: "\t", Z: "\x1a" };

const parseInsert = (sql: string, from: number): { columns?: string[]; rows: SqlValue[][] } => {
  let i = from;
  let columns: string[] | undefined;
  const skipWs = () => {
    while (i < sql.length && /\s/.test(sql[i])) i++;
  };
  skipWs();
  if (sql[i] === "(") {
    const end = sql.indexOf(")", i);
    columns = sql
      .slice(i + 1, end)
      .split(",")
      .map((c) => c.trim().replace(/^`|`$/g, ""));
    i = end + 1;
  }
  const values = /VALUES/i.exec(sql.slice(i, i + 64));
  if (!values) return { columns, rows: [] };
  i += values.index + values[0].length;

  const rows: SqlValue[][] = [];
  while (i < sql.length) {
    skipWs();
    if (sql[i] !== "(") break;
    i++;
    const row: SqlValue[] = [];
    while (i < sql.length) {
      skipWs();
      const c = sql[i];
      if (c === "'" || c === '"') {
        const q = c;
        i++;
        let out = "";
        let seg = i;
        while (i < sql.length) {
          const ch = sql[i];
          if (ch === "\\") {
            out += sql.slice(seg, i);
            const next = sql[i + 1];
            out += ESCAPES[next] ?? next;
            i += 2;
            seg = i;
          } else if (ch === q) {
            if (sql[i + 1] === q) {
              out += sql.slice(seg, i + 1);
              i += 2;
              seg = i;
            } else break;
          } else i++;
        }
        out += sql.slice(seg, i);
        i++;
        row.push(out);
      } else {
        let j = i;
        while (j < sql.length && sql[j] !== "," && sql[j] !== ")") j++;
        const token = sql.slice(i, j).trim();
        i = j;
        if (/^NULL$/i.test(token)) row.push(null);
        else if (/^_binary\s*'/i.test(token)) row.push(token.replace(/^_binary\s*'|'$/gi, ""));
        else if (/^0x[0-9a-f]+$/i.test(token)) row.push(Buffer.from(token.slice(2), "hex").toString("utf8"));
        else {
          const n = Number(token);
          row.push(token !== "" && Number.isFinite(n) ? n : token);
        }
      }
      skipWs();
      if (sql[i] === ",") {
        i++;
        continue;
      }
      if (sql[i] === ")") {
        i++;
        break;
      }
    }
    rows.push(row);
    skipWs();
    if (sql[i] === ",") i++;
  }
  return { columns, rows };
};
