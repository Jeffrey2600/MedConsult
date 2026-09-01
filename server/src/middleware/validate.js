import { ApiError } from '../utils/ApiError.js';

/**
 * Validates a request against zod schemas and replaces the raw input with
 * the parsed result, so controllers always receive coerced, trusted data.
 *
 *   router.post('/', validate({ body: createSchema }), controller)
 */
export const validate =
  ({ body, query, params }) =>
  (req, res, next) => {
    try {
      if (body) req.body = body.parse(req.body ?? {});
      if (query) req.validatedQuery = query.parse(req.query ?? {});
      if (params) req.params = params.parse(req.params ?? {});
      next();
    } catch (err) {
      if (err?.issues) {
        const details = {};
        for (const issue of err.issues) {
          details[issue.path.join('.') || '_'] = issue.message;
        }
        return next(ApiError.badRequest('Validation failed', details));
      }
      next(err);
    }
  };
