import { ZodError } from "zod";

export const validateZod = (schema) =>
    (req, res, next) => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                return res.status(400).json({
                    success: false,
                    message: "Validation error",
                    errors: err.issues.map(issue => ({
                        field: issue.path.join("."),
                        message: issue.message,
                    })),
                });
            }

            next(err);
        }
    };
