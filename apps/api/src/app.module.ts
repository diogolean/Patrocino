import { Module } from "@nestjs/common";
import { AdminModule } from "./modules/admin/admin.module";
import { AffiliatesModule } from "./modules/affiliates/affiliates.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ChatModule } from "./modules/chat/chat.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ContentModule } from "./modules/content/content.module";
import { CreatorsModule } from "./modules/creators/creators.module";
import { MediaModule } from "./modules/media/media.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { PrivacyModule } from "./modules/privacy/privacy.module";
import { SubscriptionsModule } from "./modules/subscriptions/subscriptions.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    AuthModule,
    AdminModule,
    AffiliatesModule,
    CreatorsModule,
    ContentModule,
    MediaModule,
    SubscriptionsModule,
    PaymentsModule,
    PrivacyModule,
    ChatModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
