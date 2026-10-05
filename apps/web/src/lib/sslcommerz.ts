import "server-only";

/**
 * SSLCommerz hosted checkout (cards, bKash, Nagad, Rocket, internet banking).
 * Env: SSLCZ_STORE_ID, SSLCZ_STORE_PASSWORD, SSLCZ_SANDBOX=true|false.
 * Flow: init session -> redirect to GatewayPageURL -> IPN (server-to-server) -> validate val_id -> settle.
 */
const base = () => (process.env.SSLCZ_SANDBOX === "false" ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com");

export const sslczConfigured = () => !!(process.env.SSLCZ_STORE_ID && process.env.SSLCZ_STORE_PASSWORD);

export async function initSession(p: { tranId: string; amount: number; productName: string; customer: { name: string; email: string; phone: string }; baseUrl: string }) {
  const form = new URLSearchParams({
    store_id: process.env.SSLCZ_STORE_ID!,
    store_passwd: process.env.SSLCZ_STORE_PASSWORD!,
    total_amount: p.amount.toFixed(2),
    currency: "BDT",
    tran_id: p.tranId,
    success_url: `${p.baseUrl}/api/billing/sslcommerz/return?result=success`,
    fail_url: `${p.baseUrl}/api/billing/sslcommerz/return?result=fail`,
    cancel_url: `${p.baseUrl}/api/billing/sslcommerz/return?result=cancel`,
    ipn_url: `${p.baseUrl}/api/billing/sslcommerz/ipn`,
    shipping_method: "NO",
    product_name: p.productName,
    product_category: "Software subscription",
    product_profile: "non-physical-goods",
    cus_name: p.customer.name,
    cus_email: p.customer.email,
    cus_phone: p.customer.phone || "01700000000",
    cus_add1: "Bangladesh",
    cus_city: "Dhaka",
    cus_country: "Bangladesh",
  });
  const res = await fetch(`${base()}/gwprocess/v4/api.php`, { method: "POST", body: form, signal: AbortSignal.timeout(20_000) });
  const json = (await res.json()) as { status: string; GatewayPageURL?: string; failedreason?: string; sessionkey?: string };
  if (json.status !== "SUCCESS" || !json.GatewayPageURL) throw new Error(json.failedreason ?? "SSLCommerz init failed");
  return json;
}

/** Server-side validation of a transaction (never trust the browser redirect or the IPN body alone). */
export async function validate(valId: string) {
  const qs = new URLSearchParams({ val_id: valId, store_id: process.env.SSLCZ_STORE_ID!, store_passwd: process.env.SSLCZ_STORE_PASSWORD!, format: "json" });
  const res = await fetch(`${base()}/validator/api/validationserverAPI.php?${qs}`, { signal: AbortSignal.timeout(20_000) });
  return (await res.json()) as { status: string; tran_id: string; amount: string; currency: string; bank_tran_id?: string; card_type?: string };
}
