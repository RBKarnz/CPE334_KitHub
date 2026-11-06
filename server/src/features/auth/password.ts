// Password hashing with bcrypt (DD-03, NFR-03). Each hash has its own salt and shows the
// algorithm and cost, for example $2b$12$...
import bcrypt from "bcryptjs";

export function hashPassword(password: string, cost: number): Promise<string> {
  return bcrypt.hash(password, cost);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

// One dummy hash per cost, made on first use. Sign-in compares against it when the username
// does not exist, so the response time does not reveal which usernames exist (SDS 8.2).
const dummyHashes = new Map<number, Promise<string>>();

export function dummyPasswordHash(cost: number): Promise<string> {
  let hash = dummyHashes.get(cost);
  if (!hash) {
    hash = bcrypt.hash("kithub-dummy-password", cost);
    dummyHashes.set(cost, hash);
  }
  return hash;
}
