import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { startChatSequenceWorker } from "./modules/chat/sequence";
import { applyTrustProxy } from "./http";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  applyTrustProxy(app);
  app.setGlobalPrefix("v1");
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3333",
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Patrocino API")
    .setDescription("Versioned API contract for the Patrocino prototype.")
    .setVersion("0.1")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("v1/docs", app, document);

  startChatSequenceWorker();
  await app.listen(Number(process.env.PORT ?? 3334), "0.0.0.0");
}

void bootstrap();
