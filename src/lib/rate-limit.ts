// Stores IP -> { count, expires } as a fallback
const cache = new Map<string, { count: number; expires: number }>();

export async function checkRateLimit(ip: string, limit: number = 5, windowMs: number = 60000) {
  try {
    const { getServiceClient } = await import("@/lib/supabase/service");
    const supabase = getServiceClient();
    const now = new Date();
    
    const { data: record, error } = await supabase
      .from("rate_limits")
      .select("*")
      .eq("ip", ip)
      .single();

    if (error && error.code === "42P01") throw new Error("Table missing"); // Fallback if table doesn't exist

    if (record) {
      if (new Date(record.expires_at) > now) {
        if (record.attempts >= limit) return false;
        await supabase.from("rate_limits").update({ attempts: record.attempts + 1 }).eq("ip", ip);
        return true;
      } else {
        await supabase.from("rate_limits").update({ attempts: 1, expires_at: new Date(now.getTime() + windowMs).toISOString() }).eq("ip", ip);
        return true;
      }
    } else {
      await supabase.from("rate_limits").insert({ ip, attempts: 1, expires_at: new Date(now.getTime() + windowMs).toISOString() });
      return true;
    }
  } catch (err) {
    // Fallback to memory map if DB fails or table missing
    const now = Date.now();
    const record = cache.get(ip);
    if (record && record.expires > now) {
      record.count++;
      if (record.count > limit) return false;
    } else {
      cache.set(ip, { count: 1, expires: now + windowMs });
    }
    return true;
  }
}
