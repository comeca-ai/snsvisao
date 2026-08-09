export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMClient {
  complete(
    messages: LLMMessage[],
    opts?: { json?: boolean; maxTokens?: number }
  ): Promise<string>;
}

/**
 * Tenta interpretar `text` como JSON. Se falhar, tenta reparar extraindo o
 * primeiro bloco {...} via regex. Retorna o texto JSON válido ou lança erro.
 */
export function ensureJsonText(text: string): string {
  const trimmed = text.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    const match = /\{[\s\S]*\}/.exec(trimmed);
    if (match) {
      JSON.parse(match[0]); // lança se o bloco extraído também for inválido
      return match[0];
    }
    throw new Error('Resposta do LLM não contém JSON válido');
  }
}
