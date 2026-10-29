class ApiError extends Error {
    constructor(statusCode, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }

    static badRequest(message, details) {
        return new ApiError(400, message, details);
    }

    static unauthorized(message = "Unauthorized") {
        return new ApiError(401, message);
    }

    static forbidden(message = "Forbidden") {
        return new ApiError(403, message);
    }

    static notFound(message = "Not found") {
        return new ApiError(404, message);
    }

    static conflict(message, details) {
        return new ApiError(409, message, details);
    }

    static tooMany(message = "Too many requests") {
        return new ApiError(429, message);
    }

    static internal(message = "Internal server error") {
        return new ApiError(500, message);
    }

    // Upstream AI provider failed (quota, outage, bad key, malformed reply).
    // 503 signals "the dependency is unavailable, retrying may work" — which is
    // materially different from a 500 ("your code is broken"). Keeping them
    // separate means a Gemini outage never looks like an application bug in the
    // logs, and the client can safely offer a retry.
    static aiUnavailable(message = "AI service is temporarily unavailable") {
        const err = new ApiError(503, message);
        err.isAiFailure = true;
        return err;
    }
}

module.exports = ApiError;