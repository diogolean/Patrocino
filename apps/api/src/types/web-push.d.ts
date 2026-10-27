declare module "web-push" {
  interface WebPush {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
      payload?: string | Buffer | null,
    ): Promise<{ statusCode: number; body: string; headers: Record<string, string> }>;
  }

  const webpush: WebPush;
  export = webpush;
}
