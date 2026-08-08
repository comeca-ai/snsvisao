'use client';

import { useEffect, useRef, useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Fact {
  kind: string;
  content: string;
  bottleneck?: string | null;
}

const KIND_LABELS: Record<string, string> = {
  fact: 'Fatos do negócio',
  goal: 'Objetivos',
  ask: 'Procura',
  offer: 'Oferece',
  next_step: 'Próximos passos',
};

function newSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function Page() {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [consent, setConsent] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('snsvisao-session');
    const id = stored ?? newSessionId();
    if (!stored) window.localStorage.setItem('snsvisao-session', id);
    setSessionId(id);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy || !sessionId) return;
    setInput('');
    setError('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
      setFacts(data.state?.facts ?? []);
      setConsent(Boolean(data.state?.consent));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na chamada');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (sessionId) {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, reset: true }),
      }).catch(() => undefined);
    }
    const id = newSessionId();
    window.localStorage.setItem('snsvisao-session', id);
    setSessionId(id);
    setMessages([]);
    setFacts([]);
    setConsent(false);
    setError('');
  }

  const grouped = facts.reduce<Record<string, Fact[]>>((acc, f) => {
    (acc[f.kind] ??= []).push(f);
    return acc;
  }, {});

  return (
    <main className="shell">
      <section className="chat">
        <header className="chat-header">
          <div className="avatar">🧵</div>
          <div>
            <h1>Fio — laboratório</h1>
            <p>mesmo cérebro que atenderá no WhatsApp</p>
          </div>
        </header>
        <div className="messages">
          {messages.length === 0 && (
            <div className="bubble in">
              Oi! Eu sou o Fio 🧵 — não perco o fio de nenhuma conversa. Me
              conta: o que você vende, e o que te traria mais resultado agora?
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role === 'user' ? 'out' : 'in'}`}>
              {m.content}
            </div>
          ))}
          {busy && <div className="typing">digitando…</div>}
          {error && <div className="typing">⚠️ {error}</div>}
          <div ref={endRef} />
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva como se fosse no WhatsApp…"
            autoFocus
          />
          <button type="submit" disabled={busy || !input.trim()}>
            Enviar
          </button>
        </form>
      </section>

      <aside className="crm">
        <h2>Caderninho do negócio</h2>
        <p className="sub">anotado sozinho pela conversa</p>
        <span className={`consent ${consent ? 'ok' : ''}`}>
          {consent ? '✓ Consentimento LGPD registrado' : 'Aguardando consentimento LGPD'}
        </span>
        {facts.length === 0 ? (
          <p className="empty">
            Nada anotado ainda. Converse com o agente — cada coisa importante
            que você contar aparece aqui sozinha (depois que você autorizar).
          </p>
        ) : (
          Object.entries(grouped).map(([kind, list]) => (
            <div className="fact-group" key={kind}>
              <h3>{KIND_LABELS[kind] ?? kind}</h3>
              {list.map((f, i) => (
                <div className="fact" key={i}>
                  {f.content}
                  {f.bottleneck && <span className="tag">{f.bottleneck}</span>}
                </div>
              ))}
            </div>
          ))
        )}
        <button className="reset" onClick={() => void reset()}>
          Reiniciar conversa
        </button>
      </aside>
    </main>
  );
}
