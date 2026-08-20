// src/shared/globals/helpers/response.handler.js
import { localizeTree } from '../../services/translate.service.js';

function maybeLocalize(res, data) {
  if (data == null) return data;

  // Default: return DB shape — title/content as { en, nl } objects.
  // Optional: ?i18n=localized picks one locale string (+ *I18n copies) for legacy clients.
  const localized = res.req?.query?.i18n === 'localized';
  if (!localized) return data;

  const locale = res.req?.locale || 'en';
  return localizeTree(data, locale);
}

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
      data: maybeLocalize(res, data),
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