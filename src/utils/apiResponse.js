function buildErrorPayload(message, details) {
  return {
    success: false,
    message,
    error: message,
    ...(details ? { details } : {}),
  };
}

function badRequest(res, message, details) {
  return res.status(400).json(buildErrorPayload(message, details));
}

function unauthorized(res, message = "Unauthorized request", details) {
  return res.status(401).json(buildErrorPayload(message, details));
}

function forbidden(res, message = "Access denied", details) {
  return res.status(403).json(buildErrorPayload(message, details));
}

function notFound(res, message = "Resource not found", details) {
  return res.status(404).json(buildErrorPayload(message, details));
}

function serverError(res, error, fallbackMessage = "Internal server error", details) {
  const message = fallbackMessage;

  return res.status(500).json({
    ...buildErrorPayload(message, details),
    errorCode: error?.code || "internal-error",
    ...(error?.message ? { reason: error.message } : {}),
  });
}

module.exports = {
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
};
