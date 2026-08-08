export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  const baseUrl =
    process.env.AGENT_API_URL ?? 'https://server-production-d1a1.up.railway.app';
  const token = process.env.AGENT_API_TOKEN;
  if (!token) {
    return Response.json(
      { error: 'AGENT_API_TOKEN não configurado no Vercel (copie o WEBHOOK_TOKEN do Railway)' },
      { status: 500 },
    );
  }

  const body = await req.text();
  const upstream = await fetch(`${baseUrl.replace(/\/+$/, '')}/dev/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-token': token,
    },
    body,
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
