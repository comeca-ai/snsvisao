export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  const baseUrl = process.env.AGENT_API_URL;
  const token = process.env.AGENT_API_TOKEN;
  if (!baseUrl || !token) {
    return Response.json(
      { error: 'AGENT_API_URL / AGENT_API_TOKEN não configurados no Vercel' },
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
