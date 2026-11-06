import { z } from "zod";

// GET /api/categories takes no query parameter; validate() makes this strict (DD-09).
export const catalogQuery = z.object({});
