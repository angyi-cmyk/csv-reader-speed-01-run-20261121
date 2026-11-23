// csv-reader-speed-01: a faster drop-in for make.fun's csv-reader 1.0.0.
// run(input) returns exactly csv-reader 1.0.0's answer for {text, header}:
// {columns, rows, errors}, with its whole broken-row policy (a U+FEFF dropped,
// records ending at LF or CRLF, blank lines no record, stray CRs dropped,
// quoted fields with doubled quotes and LF-normalised line breaks, junk after
// a closing quote, unterminated quotes read again as unquoted, short/long rows
// padded or cut to the first record's width), error for error.
//
// It is faster because it reads in bulk instead of one character at a time:
// a line holding no quote is split with indexOf/slice; a field holding a quote
// jumps straight to its closing quote; an unquoted field jumps straight to its
// next comma, line break or stray CR. Two pointers, the next '"' and the next
// '\r', only ever move forward, so no span of text is scanned twice.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The next '"' and the next '\r' at or after pos; only ever moved forward.
  let nextQ = text.indexOf('"', pos);
  let nextR = text.indexOf('\r', pos);

  // The record being read: the line it starts on and its index in rows (null: the header).
  let recLine = 1;
  let recRow = null;

  function refresh() {
    if (nextQ !== -1 && nextQ < pos) nextQ = text.indexOf('"', pos);
    if (nextR !== -1 && nextR < pos) nextR = text.indexOf('\r', pos);
  }

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by LF is dropped
  // (stray_cr). Returns the field and how it ended; `added` counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      if (nextR !== -1 && nextR < pos) nextR = text.indexOf('\r', pos);
      const nc = text.indexOf(',', pos);
      const nn = text.indexOf('\n', pos);
      const nr = nextR;
      let m = -1;
      let kind = -1;
      if (nc !== -1) { m = nc; kind = 0; }
      if (nn !== -1 && (m === -1 || nn < m)) { m = nn; kind = 1; }
      if (nr !== -1 && (m === -1 || nr < m)) { m = nr; kind = 2; }
      if (m === -1) {
        if (pos < n) { value += text.slice(pos); added += n - pos; }
        pos = n;
        return { value, ended: END, added };
      }
      if (m > pos) { value += text.slice(pos, m); added += m - pos; }
      if (kind === 0) { pos = m + 1; return { value, ended: COMMA, added }; }
      if (kind === 1) { pos = m + 1; line += 1; return { value, ended: LINE_BREAK, added }; }
      // A CR: a line break when followed by LF, else dropped (stray_cr).
      if (text.charCodeAt(m + 1) === 10) { pos = m + 2; line += 1; return { value, ended: LINE_BREAK, added }; }
      errors.push({ code: 'stray_cr', line: recLine, row: recRow });
      pos = m + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) break;
      if (q > pos) {
        const chunk = text.slice(pos, q);
        if (chunk.indexOf('\n') !== -1 || chunk.indexOf('\r') !== -1) {
          // CRLF and a lone CR inside quotes are each one LF; count the line breaks.
          let breaks = 0;
          for (let i = 0; i < chunk.length; i++) {
            const c = chunk.charCodeAt(i);
            if (c === 10) breaks += 1;
            else if (c === 13) { breaks += 1; if (chunk.charCodeAt(i + 1) === 10) i += 1; }
          }
          line += breaks;
          value += chunk.replace(/\r\n?/g, '\n');
        } else {
          value += chunk;
        }
      }
      if (text.charCodeAt(q + 1) === 34) { value += '"'; pos = q + 2; continue; }
      pos = q + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
      return readUnquoted('"');
    }
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; return { value, ended: COMMA }; }
    if (c === 10) { pos += 1; line += 1; return { value, ended: LINE_BREAK }; }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; return { value, ended: LINE_BREAK }; }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) errors.push({ code: 'quote_junk', line: recLine, row: recRow });
    return junk;
  }

  // The fields of one record, split at the commas of [start, end).
  function splitFields(start, end) {
    return text.slice(start, end).split(',');
  }

  // A line whose only CRs are stray ones (the CRLF at its end already stripped): drop each, one stray_cr each.
  function fixStrayCr(fields, hasLf) {
    for (let i = 0; i < fields.length; i++) {
      let f = fields[i];
      if (i === fields.length - 1 && hasLf && f.charCodeAt(f.length - 1) === 13) f = f.slice(0, -1);
      if (f.indexOf('\r') !== -1) {
        let count = 0;
        for (let j = 0; j < f.length; j++) if (f.charCodeAt(j) === 13) count += 1;
        for (let j = 0; j < count; j++) errors.push({ code: 'stray_cr', line: recLine, row: recRow });
        f = f.replace(/\r/g, '');
      }
      fields[i] = f;
    }
  }

  // A record's fields, read the slow way (its line holds a quote): one field at a time.
  function readRecordSlow() {
    const fields = [];
    let quoted = false;
    let ended;
    do {
      quoted = text.charCodeAt(pos) === 34;
      const field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
      ended = field.ended;
    } while (ended === COMMA);
    finishRecord(fields, quoted);
  }

  // Files a record's fields away: the header, a row padded or cut to the first record's width, or no record at all
  // for a line left with no characters.
  function finishRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (pos < n) {
    refresh();
    // Lines with no characters are no records.
    const nl = text.indexOf('\n', pos);
    const segEnd = nl === -1 ? n : nl;
    if (segEnd === pos) { pos = nl + 1; line += 1; continue; }
    recLine = line;
    recRow = header && columns === null ? null : rows.length;
    if (nextQ !== -1 && nextQ < segEnd) {
      readRecordSlow();
      continue;
    }
    // The fast way: this line holds no quote, so the record ends at its line break.
    let fields;
    if (nextR === -1 || nextR >= segEnd) {
      fields = splitFields(pos, segEnd);
    } else if (nl !== -1 && nextR === segEnd - 1) {
      // Its only CR is the CRLF at the line's end.
      fields = splitFields(pos, segEnd - 1);
    } else {
      fields = splitFields(pos, segEnd);
      fixStrayCr(fields, nl !== -1);
    }
    finishRecord(fields, false);
    pos = nl === -1 ? n : nl + 1;
    line += 1;
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
