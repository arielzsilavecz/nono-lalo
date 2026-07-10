// Función temporal de prueba manual — envía un push a todas las suscripciones
// existentes usando el mismo _shared/webpush.ts que usa place-order.
// Se borra después de confirmar que la notificación llega.

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendWebPush, type PushSubscriptionRow } from "../_shared/webpush.ts";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: subs, error } = await supabase.from("push_subscriptions").select("*");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  const rows = (subs ?? []) as PushSubscriptionRow[];
  if (rows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, total: 0, message: "no hay suscripciones" }), { status: 200 });
  }

  const payload = JSON.stringify({
    title: "Prueba de notificación",
    body: "Si ves esto, el sistema de push funciona.",
    url: "/admin/pedidos",
    tag: "test-push",
  });

  const results = await Promise.all(rows.map((sub) => sendWebPush(sub, payload)));

  return new Response(
    JSON.stringify({
      sent: results.filter((r) => r.ok).length,
      total: rows.length,
      results,
    }),
    { status: 200 },
  );
});
