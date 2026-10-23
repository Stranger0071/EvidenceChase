import type { LoginInput, SignupInput, UserDto } from '@evidencechase/shared';
import bcrypt from 'bcryptjs';
import { ConflictError, UnauthorizedError } from '../errors';
import { isUniqueViolation } from '../lib/prisma';
import type { Repositories } from '../repositories';
import { toUserDto } from './mappers';

export const DEFAULT_BCRYPT_COST = 12;

export function createAuthService({ users }: Repositories, options: { bcryptCost?: number } = {}) {
  const cost = options.bcryptCost ?? DEFAULT_BCRYPT_COST;
  // Compared against when the email doesn't exist, so a login takes the same time whether or not
  // the account exists. Otherwise response timing would reveal which emails are registered.
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = () => (dummyHash ??= bcrypt.hash('timing-equalizer', cost));

  return {
    async signup(input: SignupInput): Promise<UserDto> {
      const passwordHash = await bcrypt.hash(input.password, cost);
      try {
        const user = await users.create({ email: input.email, name: input.name, passwordHash });
        return toUserDto(user);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError('An account with this email already exists', 'EMAIL_TAKEN');
        }
        throw error;
      }
    },

    async login(input: LoginInput): Promise<UserDto> {
      const user = await users.findByEmail(input.email);
      const matches = await bcrypt.compare(
        input.password,
        user?.passwordHash ?? (await getDummyHash()),
      );
      if (!user || !matches) {
        // Same message for both cases, so the form doesn't reveal whether the email is registered.
        throw new UnauthorizedError('Incorrect email or password');
      }
      return toUserDto(user);
    },

    async getUser(id: string): Promise<UserDto | null> {
      const user = await users.findById(id);
      return user ? toUserDto(user) : null;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
