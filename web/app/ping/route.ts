// Healthcheck leve do canal web (Docker/compose bate aqui). Sem runtime de
// edge nem acesso a banco: só confirma que o Next.js está de pé.
export async function GET() {
  return new Response("ok", { status: 200 });
}
