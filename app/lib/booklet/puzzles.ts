export type WordSearch = {
  grid: string[][];
  words: string[];
};

export type CrosswordCell = {
  letter: string;
  number?: number;
};

export type Crossword = {
  grid: Array<Array<CrosswordCell | null>>;
  answers: string[];
  entries: CrosswordEntry[];
  complete: boolean;
};

export type CrosswordEntry = {
  answer: string;
  answerIndex: number;
  row: number;
  column: number;
  direction: "across" | "down";
  number: number;
};

export type RoutePoint = {
  row: number;
  column: number;
};

export type RouteStreet = {
  from: RoutePoint;
  to: RoutePoint;
};

export type RouteStop = RoutePoint & {
  itemIndex: number;
};

export type RoutePuzzle = {
  size: number;
  start: RoutePoint;
  finish: RoutePoint;
  stops: RouteStop[];
  allStreets: RouteStreet[];
  streets: RouteStreet[];
  closedStreets: RouteStreet[];
  minimumStreets: number;
  solutionStopOrder: number[];
};

export type MazeCell = {
  walls: [boolean, boolean, boolean, boolean];
};

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seedText: string) {
  let seed = hashText(seedText) || 1;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function normalizePuzzleWord(value: string, maximum = 9) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, maximum);
}

function uniqueWords(labels: string[], maximum: number) {
  return Array.from(
    new Set(labels.map((label) => normalizePuzzleWord(label, maximum)).filter((word) => word.length >= 3)),
  ).slice(0, 4);
}

export function createWordSearch(
  labels: string[],
  seedText = "tripquest",
  size = 10,
  allowReverse = false,
): WordSearch {
  const words = uniqueWords(labels, size);
  if (!words.length) words.push("TRIP");
  const random = makeRandom(`${seedText}|${words.join("|")}`);
  const grid = Array.from({ length: size }, () => Array<string>(size).fill(""));
  const directions: Array<readonly [number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  if (allowReverse) {
    directions.push([0, -1], [-1, 0], [-1, -1], [-1, 1]);
  }

  const placedWords: string[] = [];

  for (const word of [...words].sort((left, right) => right.length - left.length)) {
    const candidates = directions.flatMap(([rowStep, columnStep]) =>
      Array.from({ length: size * size }, (_, index) => ({
        rowStep,
        columnStep,
        row: Math.floor(index / size),
        column: index % size,
        order: random(),
      })),
    ).sort((left, right) => left.order - right.order);

    for (const { rowStep, columnStep, row, column } of candidates) {
      const endRow = row + rowStep * (word.length - 1);
      const endColumn = column + columnStep * (word.length - 1);
      if (endRow < 0 || endRow >= size || endColumn < 0 || endColumn >= size) continue;

      const fits = Array.from(word).every((letter, index) => {
        const current = grid[row + rowStep * index][column + columnStep * index];
        return !current || current === letter;
      });
      if (!fits) continue;

      Array.from(word).forEach((letter, index) => {
        grid[row + rowStep * index][column + columnStep * index] = letter;
      });
      placedWords.push(word);
      break;
    }
  }

  if (placedWords.length !== words.length) {
    grid.forEach((row) => row.fill(""));
    placedWords.length = 0;
    words.forEach((word, index) => {
      const row = index * 2;
      Array.from(word).forEach((letter, column) => {
        grid[row][column] = letter;
      });
      placedWords.push(word);
    });
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const row of grid) {
    for (let column = 0; column < row.length; column += 1) {
      if (!row[column]) row[column] = alphabet[Math.floor(random() * alphabet.length)];
    }
  }

  return { grid, words: placedWords };
}

type CrosswordPlacement = {
  word: string;
  answerIndex: number;
  row: number;
  column: number;
  direction: "across" | "down";
};

export function createCrossword(labels: string[]): Crossword {
  const size = 19;
  const records = labels.flatMap((label, answerIndex) => {
    const word = normalizePuzzleWord(label, 9);
    return word.length >= 3 ? [{ word, answerIndex }] : [];
  }).filter((record, index, all) => all.findIndex((candidate) => candidate.word === record.word) === index);
  if (!records.length) records.push({ word: "TRIP", answerIndex: 0 });
  const answers = [...records]
    .sort((left, right) => left.answerIndex - right.answerIndex)
    .map((record) => record.word);
  let bestPlacements: CrosswordPlacement[] = [];
  let solution: CrosswordPlacement[] | null = null;
  let searched = 0;

  function placementContains(placement: CrosswordPlacement, row: number, column: number) {
    if (placement.direction === "across") {
      return row === placement.row && column >= placement.column && column < placement.column + placement.word.length;
    }
    return column === placement.column && row >= placement.row && row < placement.row + placement.word.length;
  }

  function canPlace(
    letters: Array<Array<string | null>>,
    placements: CrosswordPlacement[],
    word: string,
    row: number,
    column: number,
    direction: "across" | "down",
  ) {
    const rowStep = direction === "down" ? 1 : 0;
    const columnStep = direction === "across" ? 1 : 0;
    const endRow = row + rowStep * (word.length - 1);
    const endColumn = column + columnStep * (word.length - 1);
    if (row < 0 || column < 0 || endRow >= size || endColumn >= size) return false;
    const beforeRow = row - rowStep;
    const beforeColumn = column - columnStep;
    const afterRow = endRow + rowStep;
    const afterColumn = endColumn + columnStep;
    if (letters[beforeRow]?.[beforeColumn] || letters[afterRow]?.[afterColumn]) return false;

    let crossings = 0;
    for (let index = 0; index < word.length; index += 1) {
      const nextRow = row + rowStep * index;
      const nextColumn = column + columnStep * index;
      const current = letters[nextRow][nextColumn];
      if (current) {
        if (current !== word[index]) return false;
        if (placements.some((placement) => placement.direction === direction && placementContains(placement, nextRow, nextColumn))) {
          return false;
        }
        crossings += 1;
        continue;
      }

      const neighbors = direction === "across"
        ? [[nextRow - 1, nextColumn], [nextRow + 1, nextColumn]]
        : [[nextRow, nextColumn - 1], [nextRow, nextColumn + 1]];
      if (neighbors.some(([neighborRow, neighborColumn]) => letters[neighborRow]?.[neighborColumn])) return false;
    }
    return crossings > 0;
  }

  function gridFor(placements: CrosswordPlacement[]) {
    const letters = Array.from({ length: size }, () => Array<string | null>(size).fill(null));
    for (const placement of placements) {
      const rowStep = placement.direction === "down" ? 1 : 0;
      const columnStep = placement.direction === "across" ? 1 : 0;
      Array.from(placement.word).forEach((letter, index) => {
        letters[placement.row + rowStep * index][placement.column + columnStep * index] = letter;
      });
    }
    return letters;
  }

  function placementArea(placements: CrosswordPlacement[]) {
    const rows = placements.flatMap((placement) => [placement.row, placement.row + (placement.direction === "down" ? placement.word.length - 1 : 0)]);
    const columns = placements.flatMap((placement) => [placement.column, placement.column + (placement.direction === "across" ? placement.word.length - 1 : 0)]);
    return (Math.max(...rows) - Math.min(...rows) + 1) * (Math.max(...columns) - Math.min(...columns) + 1);
  }

  function candidatesFor(
    record: { word: string; answerIndex: number },
    placements: CrosswordPlacement[],
    letters: Array<Array<string | null>>,
  ) {
    const candidates = new Map<string, CrosswordPlacement>();
    for (const existing of placements) {
      const direction: CrosswordPlacement["direction"] = existing.direction === "across" ? "down" : "across";
      for (let existingIndex = 0; existingIndex < existing.word.length; existingIndex += 1) {
        for (let wordIndex = 0; wordIndex < record.word.length; wordIndex += 1) {
          if (existing.word[existingIndex] !== record.word[wordIndex]) continue;
          const crossingRow = existing.row + (existing.direction === "down" ? existingIndex : 0);
          const crossingColumn = existing.column + (existing.direction === "across" ? existingIndex : 0);
          const row = crossingRow - (direction === "down" ? wordIndex : 0);
          const column = crossingColumn - (direction === "across" ? wordIndex : 0);
          if (!canPlace(letters, placements, record.word, row, column, direction)) continue;
          const placement = { ...record, row, column, direction };
          candidates.set(`${row}:${column}:${direction}`, placement);
        }
      }
    }
    return [...candidates.values()].sort((left, right) =>
      placementArea([...placements, left]) - placementArea([...placements, right])
      || left.row - right.row
      || left.column - right.column,
    );
  }

  function search(placements: CrosswordPlacement[], remaining: typeof records): boolean {
    searched += 1;
    if (searched > 50_000) return false;
    if (placements.length > bestPlacements.length) bestPlacements = placements;
    if (!remaining.length) {
      solution = placements;
      return true;
    }
    const letters = gridFor(placements);
    const ranked = remaining
      .map((record) => ({ record, candidates: candidatesFor(record, placements, letters) }))
      .filter((entry) => entry.candidates.length)
      .sort((left, right) => left.candidates.length - right.candidates.length || right.record.word.length - left.record.word.length);
    for (const { record, candidates } of ranked) {
      const nextRemaining = remaining.filter((candidate) => candidate !== record);
      for (const candidate of candidates) {
        if (search([...placements, candidate], nextRemaining)) return true;
      }
    }
    return false;
  }

  for (const first of [...records].sort((left, right) => right.word.length - left.word.length || left.answerIndex - right.answerIndex)) {
    const placement: CrosswordPlacement = {
      ...first,
      row: Math.floor(size / 2),
      column: Math.floor((size - first.word.length) / 2),
      direction: "across",
    };
    if (search([placement], records.filter((record) => record !== first))) break;
  }

  const placements = solution || bestPlacements;
  const letters = gridFor(placements);

  const occupiedRows: number[] = [];
  const occupiedColumns: number[] = [];
  letters.forEach((row, rowIndex) => row.forEach((letter, columnIndex) => {
    if (letter) {
      occupiedRows.push(rowIndex);
      occupiedColumns.push(columnIndex);
    }
  }));
  const top = Math.max(0, Math.min(...occupiedRows) - 1);
  const bottom = Math.min(size - 1, Math.max(...occupiedRows) + 1);
  const left = Math.max(0, Math.min(...occupiedColumns) - 1);
  const right = Math.min(size - 1, Math.max(...occupiedColumns) + 1);
  const numberedStarts = Array.from(new Set(placements.map((placement) => `${placement.row}:${placement.column}`)))
    .map((key) => {
      const [row, column] = key.split(":").map(Number);
      return { key, row, column };
    })
    .sort((left, right) => left.row - right.row || left.column - right.column);
  const starts = new Map(numberedStarts.map((start, index) => [start.key, index + 1]));
  const grid = letters.slice(top, bottom + 1).map((row, rowOffset) =>
    row.slice(left, right + 1).map((letter, columnOffset) =>
      letter
        ? {
            letter,
            number: starts.get(`${rowOffset + top}:${columnOffset + left}`),
          }
        : null,
    ),
  );

  const entries = placements
    .map((placement): CrosswordEntry => ({
      answer: placement.word,
      answerIndex: placement.answerIndex,
      row: placement.row - top,
      column: placement.column - left,
      direction: placement.direction,
      number: starts.get(`${placement.row}:${placement.column}`) || 0,
    }))
    .sort((leftEntry, rightEntry) => leftEntry.number - rightEntry.number || leftEntry.direction.localeCompare(rightEntry.direction));

  return {
    grid,
    answers,
    entries,
    complete: records.length === labels.length && placements.length === records.length,
  };
}

function routePointKey(point: RoutePoint) {
  return `${point.row}:${point.column}`;
}

function routeStreetKey(street: RouteStreet) {
  return [routePointKey(street.from), routePointKey(street.to)].sort().join("|");
}

function routeNeighbors(size: number, streets: RouteStreet[]) {
  const neighbors = new Map<string, RoutePoint[]>();
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) neighbors.set(`${row}:${column}`, []);
  }
  for (const street of streets) {
    neighbors.get(routePointKey(street.from))?.push(street.to);
    neighbors.get(routePointKey(street.to))?.push(street.from);
  }
  return neighbors;
}

function routeGridConnected(size: number, streets: RouteStreet[]) {
  const neighbors = routeNeighbors(size, streets);
  const visited = new Set(["0:0"]);
  const queue: RoutePoint[] = [{ row: 0, column: 0 }];
  for (let index = 0; index < queue.length; index += 1) {
    for (const next of neighbors.get(routePointKey(queue[index])) || []) {
      const key = routePointKey(next);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  return visited.size === size * size;
}

function solveRoutePuzzle(size: number, streets: RouteStreet[], stops: RouteStop[]) {
  const start = { row: 0, column: 0 };
  const finish = { row: size - 1, column: size - 1 };
  const stopAt = new Map(stops.map((stop) => [routePointKey(stop), stop.itemIndex]));
  const neighbors = routeNeighbors(size, streets);
  const startKey = `${routePointKey(start)}:0`;
  const queue = [{ point: start, mask: 0, distance: 0 }];
  const visited = new Set([startKey]);
  const parent = new Map<string, string>();
  let finishState = startKey;
  let distance = 0;

  for (let index = 0; index < queue.length; index += 1) {
    const state = queue[index];
    const stateKey = `${routePointKey(state.point)}:${state.mask}`;
    if (routePointKey(state.point) === routePointKey(finish) && state.mask === 0b1111) {
      finishState = stateKey;
      distance = state.distance;
      break;
    }
    for (const next of neighbors.get(routePointKey(state.point)) || []) {
      const itemIndex = stopAt.get(routePointKey(next));
      const mask = itemIndex === undefined ? state.mask : state.mask | (1 << itemIndex);
      const nextKey = `${routePointKey(next)}:${mask}`;
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      parent.set(nextKey, stateKey);
      queue.push({ point: next, mask, distance: state.distance + 1 });
    }
  }

  const path: string[] = [];
  for (let key: string | undefined = finishState; key; key = parent.get(key)) path.push(key);
  path.reverse();
  const solutionStopOrder: number[] = [];
  for (const state of path) {
    const [row, column] = state.split(":").map(Number);
    const itemIndex = stopAt.get(`${row}:${column}`);
    if (itemIndex !== undefined && !solutionStopOrder.includes(itemIndex + 1)) solutionStopOrder.push(itemIndex + 1);
  }
  return { minimumStreets: distance, solutionStopOrder };
}

export function createRoutePuzzle(seedText: string, age = 9): RoutePuzzle {
  const size = age <= 8 ? 4 : age <= 11 ? 5 : 6;
  const random = makeRandom(`${seedText}|${age}|route-v2`);
  const start = { row: 0, column: 0 };
  const finish = { row: size - 1, column: size - 1 };
  const baseStops = size === 4
    ? [{ row: 0, column: 2 }, { row: 1, column: 3 }, { row: 3, column: 1 }, { row: 2, column: 0 }]
    : size === 5
      ? [{ row: 0, column: 3 }, { row: 1, column: 1 }, { row: 4, column: 1 }, { row: 3, column: 4 }]
      : [{ row: 0, column: 4 }, { row: 2, column: 1 }, { row: 5, column: 1 }, { row: 3, column: 5 }];
  const transform = Math.floor(random() * 4);
  const stops = baseStops.map((point, itemIndex): RouteStop => {
    let { row, column } = point;
    if (transform & 1) column = size - 1 - column;
    if (transform & 2) [row, column] = [column, row];
    return { row, column, itemIndex };
  });
  const allStreets: RouteStreet[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (column + 1 < size) allStreets.push({ from: { row, column }, to: { row, column: column + 1 } });
      if (row + 1 < size) allStreets.push({ from: { row, column }, to: { row: row + 1, column } });
    }
  }
  const candidates = [...allStreets];
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
  }
  const closed = new Set<string>();
  const targetClosures = age <= 8 ? 4 : age <= 11 ? 8 : 12;
  for (const candidate of candidates) {
    if (closed.size >= targetClosures) break;
    const key = routeStreetKey(candidate);
    const trial = allStreets.filter((street) => !closed.has(routeStreetKey(street)) && routeStreetKey(street) !== key);
    if (routeGridConnected(size, trial)) closed.add(key);
  }
  const streets = allStreets.filter((street) => !closed.has(routeStreetKey(street)));
  const closedStreets = allStreets.filter((street) => closed.has(routeStreetKey(street)));
  const solution = solveRoutePuzzle(size, streets, stops);
  return { size, start, finish, stops, allStreets, streets, closedStreets, ...solution };
}

export function mazeSizeForAge(age: number) {
  if (age <= 4) return 6;
  if (age === 5) return 8;
  if (age <= 8) return 12;
  if (age <= 11) return 16;
  return 20;
}

export function createMaze(seedText: string, size = 10): MazeCell[][] {
  const random = makeRandom(seedText);
  const maze = Array.from({ length: size }, () =>
    Array.from({ length: size }, (): MazeCell => ({ walls: [true, true, true, true] })),
  );
  const visited = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const stack: Array<[number, number]> = [[0, 0]];
  visited[0][0] = true;
  const moves = [
    [-1, 0, 0, 2],
    [0, 1, 1, 3],
    [1, 0, 2, 0],
    [0, -1, 3, 1],
  ] as const;

  while (stack.length) {
    const [row, column] = stack[stack.length - 1];
    const available = moves.filter(([rowStep, columnStep]) => {
      const nextRow = row + rowStep;
      const nextColumn = column + columnStep;
      return nextRow >= 0 && nextRow < size && nextColumn >= 0 && nextColumn < size && !visited[nextRow][nextColumn];
    });
    if (!available.length) {
      stack.pop();
      continue;
    }
    const [rowStep, columnStep, wall, oppositeWall] = available[Math.floor(random() * available.length)];
    const nextRow = row + rowStep;
    const nextColumn = column + columnStep;
    maze[row][column].walls[wall] = false;
    maze[nextRow][nextColumn].walls[oppositeWall] = false;
    visited[nextRow][nextColumn] = true;
    stack.push([nextRow, nextColumn]);
  }

  maze[0][0].walls[0] = false;
  maze[size - 1][size - 1].walls[2] = false;

  return maze;
}
