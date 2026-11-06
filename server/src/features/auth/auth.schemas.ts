import { z } from "zod";

// Wider than the stored username rule on purpose: a value that passes but cannot exist gets
// the same 401 as a wrong password, so validation reveals nothing (contract F-01 4.1).
// Not trimmed; the service lowercases it.
export const loginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export type LoginBody = z.infer<typeof loginBody>;
