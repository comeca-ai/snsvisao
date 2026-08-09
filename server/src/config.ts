import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  WEBHOOK_TOKEN: z.string().min(1, 'WEBHOOK_TOKEN é obrigatório'),
  ADMIN_TOKEN: z.string().min(1, 'ADMIN_TOKEN é obrigatório'),
  DEFAULT_TENANT_SLUG: z.string().min(1).default('default'),

  LLM_PROVIDER: z.enum(['anthropic', 'kimi', 'openai']).default('anthropic'),
  LLM_MODEL: z.string().min(1).optional(),
  LLM_API_KEY: z.string().min(1, 'LLM_API_KEY é obrigatória'),
  LLM_BASE_URL: z.string().min(1).optional(),

  MESSAGING_PROVIDER: z.enum(['evolution', 'cloudapi']).default('evolution'),

  EVOLUTION_API_URL: z.string().min(1, 'EVOLUTION_API_URL é obrigatória'),
  EVOLUTION_API_KEY: z.string().min(1, 'EVOLUTION_API_KEY é obrigatória'),
  EVOLUTION_INSTANCE: z.string().min(1).default('fio'),

  // WhatsApp Cloud API oficial (Meta) — opcionais; só exigidas quando
  // MESSAGING_PROVIDER=cloudapi (stub em homologação).
  CLOUDAPI_TOKEN: z.string().min(1).optional(),
  CLOUDAPI_PHONE_ID: z.string().min(1).optional(),
  CLOUDAPI_VERIFY_TOKEN: z.string().min(1).optional(),

  SEND_MIN_INTERVAL_MS: z.coerce.number().int().nonnegative().default(1200)
});

export type AppConfig = z.infer<typeof envSchema>;

/**
 * Lê e valida o ambiente. Falha rápido com mensagem clara se faltar algo.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Configuração inválida. Verifique as variáveis de ambiente:\n${problems}`
    );
  }
  return parsed.data;
}

/** Config validada a partir de process.env (lança erro na importação se inválida). */
export const config: AppConfig = loadConfig();
