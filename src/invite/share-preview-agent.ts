/** Representation selection only. A forged agent gains no extra authority. */
export function isSharePreviewAgent(agent: string | null): boolean {
  return /WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|Applebot/i.test(
    agent ?? "",
  );
}
