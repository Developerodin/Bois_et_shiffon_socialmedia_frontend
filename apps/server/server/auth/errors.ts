export class AccessDeniedError extends Error {
  readonly code = "ACCESS_DENIED";

  constructor(message = "Access denied") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export class BrandArchivedError extends Error {
  readonly code = "BRAND_ARCHIVED";

  constructor(message = "Brand is archived") {
    super(message);
    this.name = "BrandArchivedError";
  }
}
