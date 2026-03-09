export type DomainErrorCode =
  | "ALREADY_ENROLLED_IN_COURSE"
  | "WAITING_ACTIVE_ENTRY_EXISTS"
  | "WAITING_STATE_CONFLICT";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "DomainError";
  }
}

export const isDomainError = (error: unknown): error is DomainError => error instanceof DomainError;
