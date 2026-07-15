import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { WsAuthService } from './ws-auth.service';

@Module({
  // JwtModule sin secret global (mismo patrón que AuthModule): la
  // verificación pasa el secret explícito en WsAuthService.
  imports: [JwtModule.register({})],
  providers: [EventsGateway, EventsService, WsAuthService, WsJwtGuard],
  exports: [EventsService],
})
export class EventsModule {}
