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
  row: number;
  column: number;
  direction: "across" | "down";
};

export function createCrossword(labels: string[]): Crossword {
  const size = 11;
  const answers = uniqueWords(labels, 9);
  if (!answers.length) answers.push("TRIP");
  const letters = Array.from({ length: size }, () => Array<string | null>(size).fill(null));
  const placements: CrosswordPlacement[] = [];

  function canPlace(word: string, row: number, column: number, direction: "across" | "down") {
    const rowStep = direction === "down" ? 1 : 0;
    const columnStep = direction === "across" ? 1 : 0;
    const endRow = row + rowStep * (word.length - 1);
    const endColumn = column + columnStep * (word.length - 1);
    if (row < 0 || column < 0 || endRow >= size || endColumn >= size) return false;
    return Array.from(word).every((letter, index) => {
      const current = letters[row + rowStep * index][column + columnStep * index];
      return current === null || current === letter;
    });
  }

  function place(word: string, row: number, column: number, direction: "across" | "down") {
    const rowStep = direction === "down" ? 1 : 0;
    const columnStep = direction === "across" ? 1 : 0;
    Array.from(word).forEach((letter, index) => {
      letters[row + rowStep * index][column + columnStep * index] = letter;
    });
    placements.push({ word, row, column, direction });
  }

  const first = answers[0];
  place(first, Math.floor(size / 2), Math.floor((size - first.length) / 2), "across");

  for (const word of answers.slice(1)) {
    let placed = false;
    for (const existing of placements) {
      const nextDirection = existing.direction === "across" ? "down" : "across";
      for (let existingIndex = 0; existingIndex < existing.word.length && !placed; existingIndex += 1) {
        const match = word.indexOf(existing.word[existingIndex]);
        if (match < 0) continue;
        const crossingRow = existing.row + (existing.direction === "down" ? existingIndex : 0);
        const crossingColumn = existing.column + (existing.direction === "across" ? existingIndex : 0);
        const row = crossingRow - (nextDirection === "down" ? match : 0);
        const column = crossingColumn - (nextDirection === "across" ? match : 0);
        if (canPlace(word, row, column, nextDirection)) {
          place(word, row, column, nextDirection);
          placed = true;
        }
      }
      if (placed) break;
    }

    if (!placed) {
      for (let row = 1; row < size && !placed; row += 2) {
        const column = Math.floor((size - word.length) / 2);
        if (canPlace(word, row, column, "across")) {
          place(word, row, column, "across");
          placed = true;
        }
      }
    }
  }

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
  const starts = new Map(placements.map((placement, index) => [`${placement.row}:${placement.column}`, index + 1]));
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

  return { grid, answers };
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
