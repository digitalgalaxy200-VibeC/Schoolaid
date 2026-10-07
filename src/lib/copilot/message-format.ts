/**
 * Turns Gwin's reply into blocks the chat bubble can render properly.
 *
 * The model writes light markdown — headings, bold, bullets, the occasional
 * table — and until now it was shown as raw text, so `**bold**` and `###` reached
 * the Super Admin literally. This is a deliberately small parser: exactly the
 * shapes a chat reply uses, no dependency, and anything it does not recognise is
 * left as a plain paragraph of text rather than being dropped.
 *
 * Fenced JSON is removed first: that is a plan or a read request, not prose, and
 * the plan is rendered as its own card.
 */

export type MessageBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; text: string }
  | { type: "divider" };

/** Removes fenced JSON (a plan or a reads block) — it is shown elsewhere. */
export function stripJsonBlocks(content: string): string {
  return content.replace(/```json[\s\S]*?```/g, "").trim();
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

const ORDERED_ITEM = /^\d{1,3}[.)]\s+(.*)$/;
const BULLET_ITEM = /^[-*•]\s+(.*)$/;

export function formatMessageBlocks(content: string): MessageBlock[] {
  const text = stripJsonBlocks(content);
  if (!text) return [];

  const lines = text.split("\n");
  const blocks: MessageBlock[] = [];
  let paragraph: string[] = [];
  let i = 0;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      flushParagraph();
      i++;
      continue;
    }

    // A code fence surviving the JSON strip is shown as monospaced text.
    if (trimmed.startsWith("```")) {
      flushParagraph();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      i++; // the closing fence
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "divider" });
      i++;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      i++;
      continue;
    }

    // A table starts only where a pipe row is followed by its `|---|---|` line —
    // anything else with pipes in it is prose.
    if (trimmed.startsWith("|") && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      flushParagraph();
      const headers = splitRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const firstOrdered = ORDERED_ITEM.exec(trimmed);
    const firstBullet = BULLET_ITEM.exec(trimmed);
    if (firstOrdered || firstBullet) {
      flushParagraph();
      const ordered = !!firstOrdered;
      const items: string[] = [];
      while (i < lines.length) {
        const match = ordered ? ORDERED_ITEM.exec(lines[i].trim()) : BULLET_ITEM.exec(lines[i].trim());
        if (!match) break;
        items.push(match[1].trim());
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    paragraph.push(trimmed);
    i++;
  }

  flushParagraph();
  return blocks;
}
