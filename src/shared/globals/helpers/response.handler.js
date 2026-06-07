// src/shared/globals/helpers/response.handler.js
export class ResponseHandler {
  static success(
    res,
    {
      message = 'Success',
      data,
      meta,
      statusCode = 200,
    },
  ) {
    const response = {
      success: true,
      message,
      data,
    };

    if (meta) {
      response.meta = meta;
    }

    return res.status(statusCode).json(response);
  }

  static created(
    res,
    { message = 'Resource created successfully', data },
  ) {
    return this.success(res, {
      message,
      data,
      statusCode: 201,
    });
  }

  static updated(
    res,
    { message = 'Resource updated successfully', data },
  ) {
    return this.success(res, { message, data });
  }

  static deleted(
    res,
    { message = 'Resource deleted successfully' },
  ) {
    return this.success(res, { message });
  }

  // ✅ Add this method
  static notFound(
    res,
    { message = 'Resource not found', data = null }
  ) {
    return res.status(404).json({
      success: false,
      statusCode: 404,
      message,
      data,
    });
  }

  // ✅ Add these common error methods as well
  static badRequest(
    res,
    { message = 'Bad request', data = null }
  ) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message,
      data,
    });
  }

  static unauthorized(
    res,
    { message = 'Unauthorized', data = null }
  ) {
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message,
      data,
    });
  }

  static forbidden(
    res,
    { message = 'Forbidden', data = null }
  ) {
    return res.status(403).json({
      success: false,
      statusCode: 403,
      message,
      data,
    });
  }

  static error(
    res,
    { message = 'Internal server error', statusCode = 500, data = null }
  ) {
    return res.status(statusCode).json({
      success: false,
      statusCode,
      message,
      data,
    });
  }
}