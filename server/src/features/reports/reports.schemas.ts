import { z } from "zod";

// The inventory report takes no query field; validate() makes this strict, so any field is an
// error (contract F-14 F14-D5).
export const inventoryReportQuery = z.object({});
