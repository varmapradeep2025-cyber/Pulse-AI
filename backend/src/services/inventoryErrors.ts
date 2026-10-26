export class InventoryError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly publicMessage: string,
    public readonly details?: unknown,
  ) {
    super(publicMessage);
    this.name = "InventoryError";
  }
}
