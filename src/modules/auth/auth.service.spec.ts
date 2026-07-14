import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findByEmail'
      | 'findByEmailWithSecrets'
      | 'findByIdWithSecrets'
      | 'create'
      | 'setRefreshTokenHash'
    >
  >;

  const user = {
    id: 'user-id-1',
    email: 'test@example.com',
    password: 'hashed',
    refreshTokenHash: null,
  } as User;

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findByEmailWithSecrets: jest.fn(),
      findByIdWithSecrets: jest.fn(),
      create: jest.fn(),
      setRefreshTokenHash: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest
              .fn()
              .mockImplementation((payload: { jti?: string }) =>
                Promise.resolve(
                  payload.jti ? `refresh.${payload.jti}` : 'access.token',
                ),
              ),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockImplementation((key: string) => {
              const values: Record<string, string> = {
                'jwt.accessSecret': 'a'.repeat(32),
                'jwt.accessExpiresIn': '15m',
                'jwt.refreshSecret': 'b'.repeat(32),
                'jwt.refreshExpiresIn': '7d',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('hashes the password with argon2 and never stores it in plain text', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(user);

      await authService.register(user.email, 'super-secret-password');

      const [, storedPassword] = usersService.create.mock.calls[0];
      expect(storedPassword).not.toBe('super-secret-password');
      await expect(
        argon2.verify(storedPassword, 'super-secret-password'),
      ).resolves.toBe(true);
    });

    it('rejects duplicate emails with 409', async () => {
      usersService.findByEmail.mockResolvedValue(user);

      await expect(
        authService.register(user.email, 'super-secret-password'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('returns tokens and persists the refresh hash on valid credentials', async () => {
      const password = 'super-secret-password';
      usersService.findByEmailWithSecrets.mockResolvedValue({
        ...user,
        password: await argon2.hash(password),
      });

      const tokens = await authService.login(user.email, password);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(
        user.id,
        expect.any(String),
      );
    });

    it('returns the same 401 whether the email exists or the password is wrong', async () => {
      usersService.findByEmailWithSecrets.mockResolvedValue(null);
      const unknownEmailError = await authService
        .login('nobody@example.com', 'whatever-password')
        .catch((e: Error) => e);

      usersService.findByEmailWithSecrets.mockResolvedValue({
        ...user,
        password: await argon2.hash('the-right-password'),
      });
      const wrongPasswordError = await authService
        .login(user.email, 'the-wrong-password')
        .catch((e: Error) => e);

      expect(unknownEmailError).toBeInstanceOf(UnauthorizedException);
      expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
      expect((unknownEmailError as Error).message).toBe(
        (wrongPasswordError as Error).message,
      );
    });
  });

  describe('refreshTokens', () => {
    it('rotates the refresh token when the presented token matches the stored hash', async () => {
      const password = 'super-secret-password';
      usersService.findByEmailWithSecrets.mockResolvedValue({
        ...user,
        password: await argon2.hash(password),
      });
      const { refreshToken } = await authService.login(user.email, password);
      const storedHash =
        usersService.setRefreshTokenHash.mock.calls.at(-1)?.[1];

      usersService.findByIdWithSecrets.mockResolvedValue({
        ...user,
        refreshTokenHash: storedHash,
      } as User);

      const newTokens = await authService.refreshTokens(user.id, refreshToken);
      const newHash = usersService.setRefreshTokenHash.mock.calls.at(-1)?.[1];

      expect(newTokens.refreshToken).not.toBe(refreshToken);
      expect(newHash).not.toBe(storedHash);
    });

    it('revokes the session on token reuse (valid signature, mismatched hash)', async () => {
      usersService.findByIdWithSecrets.mockResolvedValue({
        ...user,
        refreshTokenHash: 'hash-of-the-current-token',
      });

      await expect(
        authService.refreshTokens(user.id, 'an-old-rotated-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(
        user.id,
        null,
      );
    });

    it('rejects when no refresh session exists', async () => {
      usersService.findByIdWithSecrets.mockResolvedValue({
        ...user,
        refreshTokenHash: null,
      });

      await expect(
        authService.refreshTokens(user.id, 'any-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token hash', async () => {
      await authService.logout(user.id);
      expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(
        user.id,
        null,
      );
    });
  });
});
