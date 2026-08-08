import { z } from 'zod';

export const FactKind = z.enum(['fact', 'goal', 'ask', 'offer', 'next_step']);

/** Taxonomia do "quero vender mais": qual gargalo comercial o goal ataca. */
export const Bottleneck = z.enum([
  'aquisicao',
  'conversao',
  'ticket',
  'retencao',
  'posicionamento',
]);

export const ExtractionSchema = z.object({
  facts: z.array(
    z.object({
      kind: FactKind,
      content: z.string(),
      confidence: z.number(),
      /** Apenas para kind=goal, quando identificável; senão null. */
      bottleneck: Bottleneck.nullable(),
    }),
  ),
  followup: z
    .object({
      due_in_hours: z.number(),
      reason: z.string(),
    })
    .nullable(),
  /** true somente se a pessoa consentiu explicitamente em ter seus dados lembrados (LGPD). */
  consent_given: z.boolean(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const MAX_FACTS_PER_TURN = 10;
const MIN_CONFIDENCE = 0.5;
const MAX_FOLLOWUP_HOURS = 24 * 30;

/**
 * Structured outputs da Anthropic não aceitam minItems/maxItems/minimum no
 * schema — contagens e faixas são validadas AQUI, em código.
 */
export function validateExtraction(raw: Extraction): Extraction {
  const facts = raw.facts
    .filter((f) => f.content.trim().length > 0)
    .filter((f) => f.confidence >= MIN_CONFIDENCE && f.confidence <= 1)
    .slice(0, MAX_FACTS_PER_TURN)
    // bottleneck só faz sentido em goals — regra validada em código.
    .map((f) => (f.kind === 'goal' ? f : { ...f, bottleneck: null }));

  const followup =
    raw.followup &&
    raw.followup.due_in_hours > 0 &&
    raw.followup.due_in_hours <= MAX_FOLLOWUP_HOURS &&
    raw.followup.reason.trim().length > 0
      ? raw.followup
      : null;

  return { facts, followup, consent_given: raw.consent_given };
}

export const EXTRACTION_INSTRUCTIONS = `Você extrai dados estruturados de uma conversa de WhatsApp entre um agente comercial e um dono de pequeno negócio no Brasil.

Analise APENAS as mensagens mais recentes da pessoa (não do agente) e extraia:
- facts: fatos novos e concretos sobre a pessoa ou o negócio dela. kind é um de:
  - "fact": fato sobre o negócio (o que vende, pra quem, canal, equipe, preço)
  - "goal": objetivo declarado ("quero vender mais no atacado")
  - "ask": algo que a pessoa precisa/procura (fornecedor, cliente, indicação)
  - "offer": algo que a pessoa oferece e pode servir a outros
  - "next_step": compromisso combinado na conversa
  confidence entre 0 e 1. Não repita fatos já listados no contexto.
  Para kind="goal", classifique bottleneck quando identificável — um de:
  "aquisicao" (falta gente chegando), "conversao" (chega mas não fecha),
  "ticket" (fecha barato), "retencao" (compra e some), "posicionamento"
  (mensagem/oferta não conecta). Se não der pra saber ainda, null.
  Para os demais kinds, bottleneck é sempre null.
- followup: se a conversa combinou (explícita ou implicitamente) retomar contato, informe due_in_hours (número de horas a partir de agora) e reason. Caso contrário, null.
- consent_given: true SOMENTE se, nesta conversa, a pessoa aceitou explicitamente que o agente guarde/lembre os dados dela (ex.: respondeu "pode sim", "claro" a uma pergunta de consentimento). Na dúvida, false.

Extraia somente o que foi dito. Não invente, não infira além do razoável.`;
