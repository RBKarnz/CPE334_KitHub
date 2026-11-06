// Sign-in, sign-out and the current user (SDS 8.2 to 8.5).
import type { PrismaClient, Role } from "@prisma/client";
import { InvalidCredentialsError, UnauthenticatedError } from "../../core/errors.js";
import type { LoginBody } from "./auth.schemas.js";
import { dummyPasswordHash, verifyPassword } from "./password.js";
import { newSessionToken, sessionIdFor } from "../../core/session.js";

export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
}

/** The only user fields an API response may contain; never passwordHash (SDS 6.3). */
const publicUserSelect = { id: true, username: true, displayName: true, role: true } as const;

export interface AuthSettings {
  sessionTtlHours: number;
  bcryptCost: number;
}

export function authService(prisma: PrismaClient, settings: AuthSettings) {
  return {
    /** Returns the user and a new session token, or throws INVALID_CREDENTIALS. */
    async login(body: LoginBody, oldToken: string | undefined): Promise<{ user: PublicUser; token: string }> {
      const found = await prisma.user.findUnique({
        where: { username: body.username.toLowerCase() },
        select: { ...publicUserSelect, passwordHash: true },
      });
      // bcrypt runs in both cases, so an unknown username takes about as long as a wrong password.
      const hash = found?.passwordHash ?? (await dummyPasswordHash(settings.bcryptCost));
      const passwordOk = await verifyPassword(body.password, hash);
      if (!found || !passwordOk) throw new InvalidCredentialsError();

      const token = newSessionToken();
      const now = new Date();
      await prisma.$transaction([
        // Expired rows are cleaned up at sign-in, and an older cookie's session is never reused.
        prisma.session.deleteMany({
          where: { OR: [{ expiresAt: { lte: now } }, ...(oldToken ? [{ id: sessionIdFor(oldToken) }] : [])] },
        }),
        prisma.session.create({
          data: {
            id: sessionIdFor(token),
            userId: found.id,
            expiresAt: new Date(now.getTime() + settings.sessionTtlHours * 3_600_000),
          },
        }),
      ]);

      const { passwordHash: _passwordHash, ...user } = found;
      return { user, token };
    },

    /** Deletes the session if there is one. Signing out twice is harmless (SDS 8.5). */
    async logout(token: string | undefined): Promise<void> {
      if (token) await prisma.session.deleteMany({ where: { id: sessionIdFor(token) } });
    },

    async currentUser(userId: number): Promise<PublicUser> {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
      if (!user) throw new UnauthenticatedError("You are not signed in.");
      return user;
    },
  };
}
