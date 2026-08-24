export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details: Array<{ path?: string; message: string }> = []
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(message = "Resource not found"): AppError {
  return new AppError("NOT_FOUND", message, 404);
}

export function unauthorized(message = "Unauthorized"): AppError {
  return new AppError("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "Forbidden"): AppError {
  return new AppError("FORBIDDEN", message, 403);
}

export function validationError(
  message: string,
  details: Array<{ path?: string; message: string }> = []
): AppError {
  return new AppError("VALIDATION_ERROR", message, 400, details);
}
