import { LineCapStyle } from "pdf-lib";
import { createRoutePuzzle } from "../../booklet/puzzles.ts";
import { drawRoundedRect } from "../illustrations.ts";
import { drawBulletList, drawNumberBadge, drawPill, type BulletItem } from "../layout.ts";
import { colors } from "../theme.ts";
import type { GameArgs } from "./types.ts";

export function routePuzzleFor(activity: GameArgs["activity"], age: number) {
  return createRoutePuzzle(`${activity.title}|${(activity.items ?? []).map((item) => item.label).join("|")}`, age);
}

export function drawMap({ ctx, page, activity, box }: GameArgs) {
  const { fonts, type } = ctx;
  const items = activity.items ?? [];
  const puzzle = routePuzzleFor(activity, ctx.booklet.age);

  const columnGap = 12;
  const columnWidth = (box.width - columnGap) / 2;
  // Explicit markers: the legend runs in two columns, but each number must
  // match its stop on the map.
  const legend: BulletItem[] = items.map((item, index) => ({ title: item.label, text: item.clue, marker: String(index + 1) }));
  const columns = [legend.filter((_, index) => index % 2 === 0), legend.filter((_, index) => index % 2 === 1)];
  const legendOptions = { size: type.small, marker: "number" as const, maxLines: 2, gap: 6, markerColor: colors.yellow };
  const legendHeight = Math.max(...columns.map((column) =>
    -drawBulletList(null, fonts, column, { ...legendOptions, x: 0, top: 0, width: columnWidth }).bottom,
  ));

  const pillHeight = type.label * 2;
  const mapSize = Math.min(box.width - 40, box.height - legendHeight - pillHeight * 2 - 28);
  const mapX = box.x + (box.width - mapSize) / 2;
  const mapTop = box.y + box.height - pillHeight - 10;
  const mapY = mapTop - mapSize;
  drawRoundedRect(page, { x: mapX - 14, y: mapY - 14, width: mapSize + 28, height: mapSize + 28 }, 14, { color: colors.white, borderColor: colors.softLine, borderWidth: 1 });
  const point = ({ row, column }: { row: number; column: number }) => ({
    x: mapX + column * (mapSize / (puzzle.size - 1)),
    y: mapY + mapSize - row * (mapSize / (puzzle.size - 1)),
  });

  puzzle.streets.forEach((street) => {
    page.drawLine({ start: point(street.from), end: point(street.to), thickness: 2.4, color: colors.muted, lineCap: LineCapStyle.Round });
  });
  puzzle.closedStreets.forEach((street) => {
    const from = point(street.from);
    const to = point(street.to);
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const unit = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    const perpendicular = { x: -unit.y * 5, y: unit.x * 5 };
    page.drawLine({
      start: { x: middle.x - perpendicular.x, y: middle.y - perpendicular.y },
      end: { x: middle.x + perpendicular.x, y: middle.y + perpendicular.y },
      thickness: 2.4,
      color: colors.coral,
      lineCap: LineCapStyle.Round,
    });
  });
  for (let row = 0; row < puzzle.size; row += 1) {
    for (let column = 0; column < puzzle.size; column += 1) {
      page.drawCircle({ ...point({ row, column }), size: 2.4, color: colors.white, borderColor: colors.muted, borderWidth: 0.9 });
    }
  }
  [
    { ...puzzle.start, label: "S", color: colors.green, soft: colors.greenSoft },
    { ...puzzle.finish, label: "F", color: colors.coral, soft: colors.coralSoft },
  ].forEach((terminal) => {
    const location = point(terminal);
    drawRoundedRect(page, { x: location.x - 9, y: location.y - 9, width: 18, height: 18 }, 5, { color: terminal.soft, borderColor: terminal.color, borderWidth: 1.6 });
    page.drawText(terminal.label, {
      x: location.x - fonts.bold.widthOfTextAtSize(terminal.label, 9) / 2,
      y: location.y - 3.2,
      size: 9,
      font: fonts.bold,
      color: terminal.color,
    });
  });
  puzzle.stops.forEach((stop) => {
    drawNumberBadge(page, fonts, String(stop.itemIndex + 1), point(stop), 9, colors.yellow);
  });

  drawPill(page, fonts, "S = Start", { x: box.x, top: box.y + box.height, color: colors.green, fill: colors.greenSoft, size: type.label });
  drawPill(page, fonts, "F = Finish", { x: box.x + box.width, top: box.y + box.height, color: colors.coral, fill: colors.coralSoft, size: type.label, align: "right" });

  const legendTop = mapY - 24;
  columns.forEach((column, index) => {
    drawBulletList(page, fonts, column, { ...legendOptions, x: box.x + index * (columnWidth + columnGap), top: legendTop, width: columnWidth });
  });
}
