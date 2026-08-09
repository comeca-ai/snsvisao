import { describe, expect, it, vi } from 'vitest';
import { extract } from '../agent/extract.js';
import type { LLMClient } from '../llm/types.js';
import type { Message } from '../db/repo.js';

const history: Message[] = [
  {
    id: 'm1',
    contactId: 'c1',
    direction: 'in',
    body: 'vendo bolo de pote e quero dobrar as vendas',
    providerMsgId: 'p1',
    createdAt: new Date()
  }
];

function llmReturning(text: string): LLMClient {
  return { complete: vi.fn(async () => text) };
}

describe('extract', () => {
  it('faz parse de JSON válido', async () => {
    const llm = llmReturning(
      JSON.stringify({
        facts: [
          { kind: 'offer', content: 'vende bolo de pote', confidence: 0.9 },
          { kind: 'goal', content: 'dobrar as vendas' }
        ],
        followups: [{ note: 'perguntar sabores mais vendidos', dueInHours: 24 }],
        wantsToStop: false
      })
    );
    const result = await extract(llm, history, 'vendo bolo de pote');
    expect(result.facts).toHaveLength(2);
    expect(result.facts[0]).toEqual({
      kind: 'offer',
      content: 'vende bolo de pote',
      confidence: 0.9
    });
    expect(result.followups).toEqual([
      { note: 'perguntar sabores mais vendidos', dueInHours: 24 }
    ]);
    expect(result.wantsToStop).toBe(false);
    expect(llm.complete).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ json: true })
    );
  });

  it('repara JSON com texto em volta', async () => {
    const llm = llmReturning(
      'Claro! Aqui está a extração:\n{"facts":[{"kind":"context","content":"atende no centro"}],"followups":[],"wantsToStop":true}\nEspero ter ajudado!'
    );
    const result = await extract(llm, history, 'atendo no centro');
    expect(result.facts).toEqual([
      { kind: 'context', content: 'atende no centro', confidence: undefined }
    ]);
    expect(result.wantsToStop).toBe(true);
  });

  it('retorna vazio quando não há nada novo', async () => {
    const llm = llmReturning('{"facts":[],"followups":[]}');
    const result = await extract(llm, history, 'ok');
    expect(result.facts).toEqual([]);
    expect(result.followups).toEqual([]);
    expect(result.wantsToStop).toBe(false);
  });

  it('lança erro quando não há JSON nenhum', async () => {
    const llm = llmReturning('sem json aqui');
    await expect(extract(llm, history, 'oi')).rejects.toThrow();
  });
});
