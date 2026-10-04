import type { PDFPage } from "pdf-lib";
import { drawRoundedRect } from "./illustrations.ts";
import { drawDottedLine, drawText, lineHeightFor, pdfText, type Box, type Fonts } from "./layout.ts";
import { colors, minReadableSize } from "./theme.ts";

// Write-in space for children: every place a child writes is laid out from
// rows exactly one writing pitch tall (theme.ts writingLinePitch), with the
// ruled line at the bottom of the row, so a 5-year-old gets 11mm letters
// everywhere rather than a thin blank squeezed in after a label.
//
// Prompts arrive as one line with inline blanks ("My answer: ____
// Evidence: ____", "My matches: 1-__ 2-__ 3-__ 4-__"). parseWritePrompt
// turns them into labelled fields, so each blank becomes a full ruled row
// (or, for short numbered blanks, a row of evenly spaced slots).

export type WriteField = {
  label: string;
  // One entry per blank: the short text printed just before it ("1-",
  // "-"), or "" for none. A single "" is one full-width answer line.
  slots: string[];
};

export type WritePrompt = {
  // Text with no blank of its own: the question, or the label before a
  // set of choices.
  intro: string;
  fields: WriteField[];
  // "easy / twisty / super tricky": options to circle.
  choices: string[];
};

const BLANK = /_{2,}/;
const SLOT_PREFIX = /^[0-9A-Za-z]{0,2}[-=.)]$/;

export function parseWritePrompt(prompt: string): WritePrompt {
  const text = pdfText(prompt);
  if (!BLANK.test(text)) {
    // "My route score: easy / twisty / super tricky"
    const choice = text.match(/^(.*?:)\s*(.+)$/);
    const options = choice ? choice[2].split(/\s+\/\s+/).map((option) => option.trim()).filter(Boolean) : [];
    if (choice && options.length >= 2 && options.length <= 5 && options.every((option) => option.split(" ").length <= 3)) {
      return { intro: choice[1], fields: [], choices: options };
    }
    return { intro: text, fields: [], choices: [] };
  }
  const parts = text.split(/_{2,}/);
  const fields: WriteField[] = [];
  parts.slice(0, -1).forEach((part) => {
    const words = part.trim().split(" ").filter(Boolean);
    const last = words[words.length - 1] ?? "";
    const prefix = last && SLOT_PREFIX.test(last) ? last : "";
    const label = (prefix ? words.slice(0, -1) : words).join(" ");
    const current = fields[fields.length - 1];
    if (!label && current) current.slots.push(prefix);
    else fields.push({ label, slots: [prefix] });
  });
  const trailing = parts[parts.length - 1].trim();
  if (trailing) fields.push({ label: trailing, slots: [""] });
  return { intro: "", fields, choices: [] };
}

export type WriteAreaOptions = {
  pitch: number;
  // Size of the printed labels and question text.
  size: number;
  // Ruled rows the area always has, counting answer rows.
  minLines: number;
  // Never more than this many ruled rows, however tall the box.
  maxLines?: number;
};

type Row = { height: number; ruled: boolean; draw: (page: PDFPage, top: number) => void };

// A ruled writing line: the shared dotted style, sitting `inset` above the
// bottom of its row.
export function drawRuledLine(page: PDFPage, x1: number, x2: number, y: number) {
  drawDottedLine(page, x1, x2, y, colors.line, 2.5, 3);
}

const LINE_INSET = 5;

function layoutRows(fonts: Fonts, prompt: string | WritePrompt, x: number, width: number, options: WriteAreaOptions) {
  const parsed = typeof prompt === "string" ? parseWritePrompt(prompt) : prompt;
  const { pitch } = options;
  const size = Math.max(minReadableSize, options.size);
  const font = fonts.regular;
  const labelFont = fonts.bold;
  const lineHeight = lineHeightFor(size);
  const rows: Row[] = [];
  const textRow = (value: string, bold: boolean, maxLines: number) => {
    const height = drawText(null, value, fonts, { x, top: 0, width }, { size, font: bold ? labelFont : font, maxLines }).height;
    rows.push({
      height: height + 2,
      ruled: false,
      draw: (page, top) => { drawText(page, value, fonts, { x, top, width }, { size, font: bold ? labelFont : font, color: colors.ink, maxLines }); },
    });
  };
  // One pitch-tall row: an optional label sitting on the line, then the
  // line (or several short slots) across the rest of the width.
  const ruledRow = (label: string, slots: string[]) => {
    rows.push({
      height: pitch,
      ruled: true,
      draw: (page, top) => {
        const lineY = top - pitch + LINE_INSET;
        let startX = x;
        if (label) {
          page.drawText(pdfText(label), { x, y: lineY + 3, size, font: labelFont, color: colors.muted });
          startX = x + labelFont.widthOfTextAtSize(pdfText(label), size) + 8;
        }
        const gap = 12;
        const slotWidth = (x + width - startX - gap * (slots.length - 1)) / slots.length;
        slots.forEach((prefix, index) => {
          let slotX = startX + index * (slotWidth + gap);
          if (prefix) {
            page.drawText(prefix, { x: slotX, y: lineY + 3, size, font: labelFont, color: colors.muted });
            slotX += labelFont.widthOfTextAtSize(prefix, size) + 4;
          }
          drawRuledLine(page, slotX, startX + index * (slotWidth + gap) + slotWidth, lineY);
        });
      },
    });
  };

  if (parsed.intro) textRow(parsed.intro, false, 3);
  if (parsed.choices.length) {
    const height = size * 2.3;
    rows.push({
      height: height + 8,
      ruled: false,
      draw: (page, top) => {
        let choiceX = x;
        parsed.choices.forEach((choice) => {
          const label = pdfText(choice);
          const choiceWidth = labelFont.widthOfTextAtSize(label, size) + size * 2.2;
          if (choiceX + choiceWidth > x + width) return;
          drawRoundedRect(page, { x: choiceX, y: top - 4 - height, width: choiceWidth, height }, height / 2, { color: colors.white, borderColor: colors.line, borderWidth: 1 });
          page.drawText(label, { x: choiceX + size * 1.1, y: top - 4 - height / 2 - size * 0.34, size, font: labelFont, color: colors.ink });
          choiceX += choiceWidth + 10;
        });
      },
    });
  }
  for (const field of parsed.fields) {
    const labelWidth = field.label ? labelFont.widthOfTextAtSize(pdfText(field.label), size) + 8 : 0;
    const perSlot = (width - labelWidth) / field.slots.length;
    const inline = labelWidth <= width * (field.slots.length > 1 ? 0.36 : 0.45) && perSlot >= 44;
    if (inline) {
      ruledRow(field.label, field.slots);
    } else {
      textRow(field.label, true, 2);
      ruledRow("", field.slots);
    }
  }
  const ruled = () => rows.filter((row) => row.ruled).length;
  while (ruled() < options.minLines) ruledRow("", [""]);
  return { rows, extraRow: () => ruledRow("", [""]), ruled, lineHeight };
}

// The smallest height the write area for `prompt` needs at `width`.
export function measureWriteArea(fonts: Fonts, prompt: string | WritePrompt, width: number, options: WriteAreaOptions) {
  return layoutRows(fonts, prompt, 0, width, options).rows.reduce((sum, row) => sum + row.height, 0);
}

// Draws the write area top-down in `box`, adding further ruled rows while
// the box has room for them (up to maxLines). Returns the ruled row count.
export function drawWriteArea(page: PDFPage, fonts: Fonts, prompt: string | WritePrompt, box: Box, options: WriteAreaOptions) {
  const layout = layoutRows(fonts, prompt, box.x, box.width, options);
  const used = () => layout.rows.reduce((sum, row) => sum + row.height, 0);
  while (used() + options.pitch <= box.height + 0.01 && layout.ruled() < (options.maxLines ?? Number.POSITIVE_INFINITY)) layout.extraRow();
  let top = box.y + box.height;
  for (const row of layout.rows) {
    row.draw(page, top);
    top -= row.height;
  }
  return { lines: layout.ruled(), bottom: top };
}

// Plain ruled rows, one pitch apart, filling `box` from the top down (or,
// with align "bottom", sitting on the box's bottom edge). Returns how many
// rows were drawn.
export function drawRuledRows(page: PDFPage, box: Box, pitch: number, align: "top" | "bottom" = "top") {
  const count = Math.max(0, Math.floor((box.height + 0.01) / pitch));
  const top = align === "bottom" ? box.y + count * pitch : box.y + box.height;
  for (let row = 0; row < count; row += 1) {
    drawRuledLine(page, box.x, box.x + box.width, top - (row + 1) * pitch + LINE_INSET);
  }
  return count;
}
