import { Module } from '@nestjs/common';
import { AttemptsService } from './attempts.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { SessionsService } from './sessions.service.js';
import { TotpService } from './totp.service.js';
import { SessionGuard } from '../security/session.guard.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TotpService, AttemptsService, SessionsService, SessionGuard],
  exports: [AuthService, SessionsService, SessionGuard],
})
export class AuthModule {}
