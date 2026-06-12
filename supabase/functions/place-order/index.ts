// Edge Function: place-order
// Recibe el encargo de la carta pública, lo valida y lo crea de forma
// atómica vía la función SQL `place_order` (cupos, fecha límite y total
// se resuelven en la base, nunca con datos del navegador).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface OrderItemInput {
  menu_item_id: string;
  qty: number;
}

interface OrderInput {
  menu_id: string;
  customer_name: string;
  customer_phone: string;
  fulfillment: "pickup" | "delivery";
  address?: string;
  notes?: string;
  items: OrderItemInput[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(body: OrderInput): string | null {
  if (!body || typeof body !== "object") return "INVALID_BODY";
  if (typeof body.menu_id !== "string" || !UUID_RE.test(body.menu_id)) return "INVALID_BODY";
  if (typeof body.customer_name !== "string" || !body.customer_name.trim() || body.customer_name.length > 80) {
    return "INVALID_CUSTOMER";
  }
  const phoneDigits = String(body.customer_phone ?? "").replace(/\D/g, "");
  if (phoneDigits.length < 6 || phoneDigits.length > 20) return "INVALID_PHONE";
  if (body.fulfillment !== "pickup" && body.fulfillment !== "delivery") return "INVALID_FULFILLMENT";
  if (body.fulfillment === "delivery" && (!body.address || !body.address.trim() || body.address.length > 200)) {
    return "ADDRESS_REQUIRED";
  }
  if (typeof body.notes === "string" && body.notes.length > 500) return "INVALID_BODY";
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 20) return "EMPTY_ORDER";
  for (const item of body.items) {
    if (!item || typeof item.menu_item_id !== "string" || !UUID_RE.test(item.menu_item_id)) return "INVALID_BODY";
    if (!Number.isInteger(item.qty) || item.qty <= 0 || item.qty > 100) return "INVALID_QTY";
  }
  return null;
}

// Errores de la función SQL -> respuesta HTTP
const KNOWN_ERRORS: Record<string, number> = {
  MENU_NOT_AVAILABLE: 409,
  DEADLINE_PASSED: 409,
  SOLD_OUT: 409,
  ITEM_NOT_FOUND: 400,
  INVALID_CUSTOMER: 400,
  INVALID_FULFILLMENT: 400,
  ADDRESS_REQUIRED: 400,
  EMPTY_ORDER: 400,
  INVALID_QTY: 400,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body: OrderInput;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_BODY" }, 400);
  }

  const validationError = validate(body);
  if (validationError) {
    return json({ error: validationError }, 400);
  }

  // Unificar ítems repetidos
  const merged = new Map<string, number>();
  for (const item of body.items) {
    merged.set(item.menu_item_id, (merged.get(item.menu_item_id) ?? 0) + item.qty);
  }
  const items = [...merged.entries()].map(([menu_item_id, qty]) => ({ menu_item_id, qty }));

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc("place_order", {
    p_menu_id: body.menu_id,
    p_customer_name: body.customer_name.trim(),
    p_customer_phone: body.customer_phone.trim(),
    p_fulfillment: body.fulfillment,
    p_address: body.address?.trim() ?? null,
    p_notes: body.notes?.trim() ?? "",
    p_items: items,
  });

  if (error) {
    const message = error.message ?? "";
    const code = Object.keys(KNOWN_ERRORS).find((k) => message.startsWith(k));
    if (code === "SOLD_OUT") {
      return json({ error: "SOLD_OUT", dish: message.slice("SOLD_OUT:".length) }, 409);
    }
    if (code) {
      return json({ error: code }, KNOWN_ERRORS[code]);
    }
    console.error("place-order error:", message);
    return json({ error: "INTERNAL" }, 500);
  }

  return json(data, 201);
});
