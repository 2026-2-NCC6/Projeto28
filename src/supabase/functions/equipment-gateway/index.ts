// Edge Function `equipment-gateway` — ponto de entrada Deno (Supabase).
// A lógica e as validações ficam em handler.mjs (testadas em Node contra PostgreSQL real).
//
// SEGREDOS: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são variáveis de ambiente da própria
// função, dentro do Supabase. A service_role NUNCA é enviada ao notebook, app ou firmware.
//
// DEPLOY (requer autorização do responsável; nada foi executado):
//   supabase functions deploy equipment-gateway
// O JWT é verificado por padrão (o notebook envia a anon key pública como Bearer); a
// autenticação real do equipamento é a chave individual validada dentro da RPC.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleGatewayRequest } from './handler.mjs';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

Deno.serve(async (req: Request) => {
  const bodyText = await req.text();
  const out = await handleGatewayRequest(
    { method: req.method, headers: req.headers, bodyText },
    { rpc: (fn: string, args: Record<string, unknown>) => admin.rpc(fn, args) }
  );
  return new Response(JSON.stringify(out.body), {
    status: out.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
});
