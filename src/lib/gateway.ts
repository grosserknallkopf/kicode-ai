import { createGateway } from "@ai-sdk/gateway";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";

/**
 * KiCode AI Gateway – zentraler Zugriff auf DeepSeek V4.1 Flash
 *
 * Features:
 * - sort: 'cost' → Provider nach niedrigsten Kosten sortiert
 * - disallowPromptTraining: true → KEINE Provider, die Prompts für Training nutzen
 * - has: ['tool-use'] → nur Provider die Tool-Calls unterstützen
 */
export const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
});

/** Das primäre Modell für KiCode AI */
export const PRIMARY_MODEL = "deepseek/deepseek-v4.1-flash" as const;

/** Fallback-Modelle, sortiert nach Kosten */
export const FALLBACK_MODELS = [
  "deepseek/deepseek-v4-flash",
  "google/gemini-3.8-flash",
] as const;

/**
 * Standard-Gateway-Optionen:
 * - Nach Kosten sortieren
 * - Kein Prompt-Training
 * - Tool-Use erforderlich
 * - User-Tracking für Multi-User
 */
export function getGatewayOptions(
  userId: string,
  tags: string[] = []
): { gateway: GatewayProviderOptions } {
  return {
    gateway: {
      sort: "cost",
      disallowPromptTraining: true,
      has: ["tool-use"],
      user: userId,
      tags: ["kicode-agent", ...tags],
      models: [...FALLBACK_MODELS],
    },
  };
}
