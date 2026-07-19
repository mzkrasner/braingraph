/** Error caused by invalid CLI input or unsafe requested behavior. */
export class UsageError extends Error {
  /** Creates a usage error with a user-facing message. */
  public constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}
