function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

export interface AppConfig {
  port: number;
  webhookToken: string;
  evolution: {
    baseUrl: string;
    apiKey: string;
    instance: string;
  };
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
  agentModel: string;
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  cached = {
    port: Number(process.env.PORT ?? 3000),
    webhookToken: required('WEBHOOK_TOKEN'),
    evolution: {
      baseUrl: required('EVOLUTION_API_URL').replace(/\/+$/, ''),
      apiKey: required('EVOLUTION_API_KEY'),
      instance: required('EVOLUTION_INSTANCE'),
    },
    supabase: {
      url: required('SUPABASE_URL'),
      serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    },
    agentModel: process.env.AGENT_LLM_MODEL ?? 'claude-opus-5',
  };
  return cached;
}
