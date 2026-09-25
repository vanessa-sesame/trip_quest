// Generation error types. Plain fields instead of TypeScript parameter
// properties so Node's --experimental-strip-types test runner can load them.

export class KimiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class UserCorrectionError extends Error {}

export class GenerationBusyError extends Error {}

export class GenerationStageError extends Error {
  readonly stage: "research" | "composition";

  constructor(stage: "research" | "composition", cause: unknown) {
    super(cause instanceof Error ? cause.message : `The ${stage} stage failed.`, {
      cause,
    });
    this.stage = stage;
  }
}
