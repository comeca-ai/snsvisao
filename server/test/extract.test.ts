import { describe, it, expect } from 'vitest';
import { validateExtraction, type Extraction } from '../src/agent/extract.js';

function base(overrides: Partial<Extraction> = {}): Extraction {
  return { facts: [], followup: null, consent_given: false, ...overrides };
}

describe('validateExtraction (limites validados em código, não no schema)', () => {
  it('remove fatos com confiança baixa ou conteúdo vazio', () => {
    const result = validateExtraction(
      base({
        facts: [
          { kind: 'fact', content: 'Vende semijoias no atacado', confidence: 0.9, bottleneck: null },
          { kind: 'goal', content: 'Quer vender mais', confidence: 0.4, bottleneck: null },
          { kind: 'fact', content: '   ', confidence: 0.9, bottleneck: null },
          { kind: 'fact', content: 'Confiança impossível', confidence: 1.5, bottleneck: null },
        ],
      }),
    );
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.content).toBe('Vende semijoias no atacado');
  });

  it('limita a 10 fatos por turno', () => {
    const facts = Array.from({ length: 15 }, (_, i) => ({
      kind: 'fact' as const,
      content: `Fato ${i}`,
      confidence: 0.9,
      bottleneck: null,
    }));
    expect(validateExtraction(base({ facts })).facts).toHaveLength(10);
  });

  it('mantém bottleneck em goals e zera nos demais kinds', () => {
    const result = validateExtraction(
      base({
        facts: [
          { kind: 'goal', content: 'Vender mais no varejo', confidence: 0.9, bottleneck: 'conversao' },
          { kind: 'fact', content: 'Tem loja física', confidence: 0.9, bottleneck: 'ticket' },
        ],
      }),
    );
    expect(result.facts[0]!.bottleneck).toBe('conversao');
    expect(result.facts[1]!.bottleneck).toBeNull();
  });

  it('descarta followup com prazo inválido', () => {
    expect(
      validateExtraction(base({ followup: { due_in_hours: -2, reason: 'cobrar' } })).followup,
    ).toBeNull();
    expect(
      validateExtraction(base({ followup: { due_in_hours: 24 * 60, reason: 'cobrar' } }))
        .followup,
    ).toBeNull();
    expect(
      validateExtraction(base({ followup: { due_in_hours: 24, reason: '  ' } })).followup,
    ).toBeNull();
  });

  it('mantém followup válido e o consentimento', () => {
    const result = validateExtraction(
      base({ followup: { due_in_hours: 48, reason: 'cobrar proposta' }, consent_given: true }),
    );
    expect(result.followup).toEqual({ due_in_hours: 48, reason: 'cobrar proposta' });
    expect(result.consent_given).toBe(true);
  });
});
