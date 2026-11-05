// This store is called only after operator-key authorization. Nothing here is
// exposed by the public demo's lead, campaign, summary or inbox endpoints.
export function createMetaTestStore(env, fetcher = fetch) {
  async function db(path, options = {}) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
      throw Object.assign(new Error("Private test storage needs server setup."), { status: 503 });
    }
    const headers = new Headers({ apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` });
    if (options.body) headers.set("content-type", "application/json");
    headers.set("prefer", "return=representation");
    let response;
    try {
      response = await fetcher(`${String(env.SUPABASE_URL).replace(/\/$/, "")}/rest/v1/${path}`, {
        ...options, headers, signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw Object.assign(new Error("Private test data could not be reached. Refresh the list before trying again."), { status: 502 });
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const duplicate = data?.code === "23505";
      throw Object.assign(new Error(duplicate
        ? "This phone number is already in your private leads. Select that lead."
        : "Private test data could not be saved or loaded. Refresh the list before trying again."), { status: duplicate ? 409 : 503 });
    }
    return data;
  }
  const campaignSelect = "*,lead:meta_test_leads(id,name,phone,consented)";
  return {
    listLeads: () => db("meta_test_leads?select=id,name,phone,consented,created_at&order=created_at.desc&limit=100"),
    createLead: async lead => (await db("meta_test_leads", { method: "POST", body: JSON.stringify(lead) }))[0],
    getLead: async id => (await db(`meta_test_leads?id=eq.${id}&select=id,name,phone,consented&limit=1`))[0],
    listCampaigns: () => db(`meta_test_campaigns?select=${campaignSelect}&order=created_at.desc&limit=100`),
    createCampaign: async campaign => (await db(`meta_test_campaigns?select=${campaignSelect}`, { method: "POST", body: JSON.stringify(campaign) }))[0],
    getCampaign: async id => (await db(`meta_test_campaigns?id=eq.${id}&select=${campaignSelect}&limit=1`))[0],
    // Conditional UPDATE is one atomic claim, including across function instances.
    claimCampaign: async id => (await db(`meta_test_campaigns?id=eq.${id}&status=eq.draft`, {
      method: "PATCH", body: JSON.stringify({ status: "sending", attempted_at: new Date().toISOString() }),
    }))[0],
    finishCampaign: async (id, status, messageId = null) => (await db(`meta_test_campaigns?id=eq.${id}&status=eq.sending`, {
      method: "PATCH", body: JSON.stringify({ status, meta_message_id: messageId }),
    }))[0],
  };
}
