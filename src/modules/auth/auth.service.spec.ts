import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { LoginUseCase } from './use-cases/login.use-case';
import { LogoutUseCase } from './use-cases/logout.use-case';
import { RefreshTokensUseCase } from './use-cases/refresh-tokens.use-case';
import { RegisterUseCase } from './use-cases/register.use-case';

// Se testea a través de la fachada AuthService con los use cases reales:
// valida el wiring completo del módulo, solo se mockea la infraestructura.
describe('AuthService', () => {
  let authService: AuthService;
  let usersRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  const user = {
    id: 'user-id-1',
    email: 'test@example.com',
    password: 'hashed',
    refreshTokenHash: null,
  } as User;

  /** Hash del refresh persistido en la última llamada a update(). */
  const lastStoredHash = (): string | null => {
    const lastCall = usersRepository.update.mock.calls.at(-1) as [
      string,
      { refreshTokenHash: string | null },
    ];
    return lastCall[1].refreshTokenHash;
  };

  beforeEach(async () => {
    usersRepository = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data: Partial<User>) => data),
      save: jest.fn().mockResolvedValue(user),
      update: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        TokenService,
        RegisterUseCase,
        LoginUseCase,
        RefreshTokensUseCase,
        LogoutUseCase,
        { provide: getRepositoryToken(User), useValue: usersRepository },
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
      usersRepository.findOne.mockResolvedValue(null);

      await authService.register(user.email, 'super-secret-password');

      const [{ password: storedPassword }] = usersRepository.create.mock
        .calls[0] as [{ password: string }];
      expect(storedPassword).not.toBe('super-secret-password');
      await expect(
        argon2.verify(storedPassword, 'super-secret-password'),
      ).resolves.toBe(true);
    });

    it('rejects duplicate emails with 409', async () => {
      usersRepository.findOne.mockResolvedValue(user);

      await expect(
        authService.register(user.email, 'super-secret-password'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('returns tokens and persists the refresh hash on valid credentials', async () => {
      const password = 'super-secret-password';
      usersRepository.findOne.mockResolvedValue({
        ...user,
        password: await argon2.hash(password),
      });

      const tokens = await authService.login(user.email, password);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(usersRepository.update).toHaveBeenCalledWith(user.id, {
        refreshTokenHash: expect.any(String) as string,
      });
    });

    it('returns the same 401 whether the email exists or the password is wrong', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      const unknownEmailError = await authService
        .login('nobody@example.com', 'whatever-password')
        .catch((e: Error) => e);

      usersRepository.findOne.mockResolvedValue({
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
      usersRepository.findOne.mockResolvedValue({
        ...user,
        password: await argon2.hash(password),
      });
      const { refreshToken } = await authService.login(user.email, password);
      const storedHash = lastStoredHash();

      usersRepository.findOne.mockResolvedValue({
        ...user,
        refreshTokenHash: storedHash,
      });

      const newTokens = await authService.refreshTokens(user.id, refreshToken);
      const newHash = lastStoredHash();

      expect(newTokens.refreshToken).not.toBe(refreshToken);
      expect(newHash).not.toBe(storedHash);
    });

    it('revokes the session on token reuse (valid signature, mismatched hash)', async () => {
      usersRepository.findOne.mockResolvedValue({
        ...user,
        refreshTokenHash: 'hash-of-the-current-token',
      });

      await expect(
        authService.refreshTokens(user.id, 'an-old-rotated-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersRepository.update).toHaveBeenCalledWith(user.id, {
        refreshTokenHash: null,
      });
    });

    it('rejects when no refresh session exists', async () => {
      usersRepository.findOne.mockResolvedValue({
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
      expect(usersRepository.update).toHaveBeenCalledWith(user.id, {
        refreshTokenHash: null,
      });
    });
  });
});
