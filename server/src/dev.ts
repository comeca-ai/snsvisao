import type { Request, Response } from 'express';
import { generateReply, extractFromConversation, type ConversationTurn } from './agent/claude.js';
import type { AgentContext } from './agent/prompt.js';
import type { Extraction } from './agent/extract.js';

/**
 * Chat de desenvolvimento: exercita o cérebro do agente (mesmo prompt e
 * mesma extração do WhatsApp) sem Evolution nem Supabase — memória fica em
 * RAM por sessão. Usado pelo chat web (Vercel) na Fase 0 de testes.
 */

interface DevSession {
  history: ConversationTurn[];
  facts: Array<{ kind: string; content: string; bottleneck?: string | null }>;
  consent: boolean;
  touchedAt: number;
}

const sessions = new Map<string, DevSession>();
const MAX_SESSIONS = 500;
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_TURNS = 60;

function getSession(id: string): DevSession {
  const now = Date.now();
  // Poda sessões velhas (e as mais antigas se estourar o teto).
  for (const [key, s] of sessions) {
    if (now - s.touchedAt > SESSION_TTL_MS) sessions.delete(key);
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (!oldest) break;
    sessions.delete(oldest);
  }
  let session = sessions.get(id);
  if (!session) {
    session = { history: [], facts: [], consent: false, touchedAt: now };
    sessions.set(id, session);
  }
  session.touchedAt = now;
  return session;
}

export async function devChatHandler(req: Request, res: Response): Promise<void> {
  const { sessionId, message, reset } = req.body as {
    sessionId?: string;
    message?: string;
    reset?: boolean;
  };
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'sessionId obrigatório' });
    return;
  }
  if (reset) {
    sessions.delete(sessionId);
    res.json({ ok: true });
    return;
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message obrigatória' });
    return;
  }

  const session = getSession(sessionId);
  session.history.push({ role: 'user', content: message.trim() });
  if (session.history.length > MAX_TURNS) {
    session.history.splice(0, session.history.length - MAX_TURNS);
  }

  const ctx: AgentContext = {
    businessProfile: {},
    facts: session.facts.map((f) => ({ kind: f.kind, content: f.content })),
  };

  try {
    const reply = await generateReply(ctx, session.history);
    session.history.push({ role: 'assistant', content: reply });

    let extraction: Extraction = { facts: [], followup: null, consent_given: false };
    try {
      extraction = await extractFromConversation(ctx, session.history);
      if (extraction.consent_given) session.consent = true;
      if (session.consent) session.facts.push(...extraction.facts);
    } catch (err) {
      console.error('Extração (dev) falhou:', err);
    }

    res.json({
      reply,
      extraction,
      state: { consent: session.consent, facts: session.facts },
    });
  } catch (err) {
    console.error('devChatHandler falhou:', err);
    res.status(500).json({ error: 'Falha ao gerar resposta' });
  }
}
