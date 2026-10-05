import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function getUser(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("user_id, pro, pro_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: created, error: createError } = await supabase
      .from("users")
      .insert({
        user_id: userId,
        pro: false,
        pro_until: null
      })
      .select("user_id, pro, pro_until")
      .single();

    if (createError) throw createError;
    return created;
  }

  return data;
}

export async function getMessages(userId, limit = 100) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, user_id, role, message, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).reverse().map(x => ({
    id: x.id,
    userId: x.user_id,
    role: x.role,
    message: x.message,
    content: x.content,
    createdAt: x.created_at
  }));
}

export async function saveMessages(messages) {
  const rows = messages.map(x => ({
    id: x.id,
    user_id: x.userId,
    role: x.role,
    message: x.message ?? null,
    content: x.content ?? x.message ?? null,
    created_at: x.createdAt
  }));

  const { error } = await supabase
    .from("messages")
    .upsert(rows, { onConflict: "id" });

  if (error) throw error;
}

export async function deleteMessages(userId) {
  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("user_id", userId);

  if (error) throw error;
}

export async function getInitiative(userId) {
  const { data, error } = await supabase
    .from("initiative")
    .select("user_id, enabled, hours, type, last_message_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      enabled: true,
      hours: 12,
      type: "casual",
      lastMessageAt: null
    };
  }

  return {
    enabled: data.enabled,
    hours: data.hours,
    type: data.type,
    lastMessageAt: data.last_message_at
  };
}

export async function saveInitiative(userId, settings) {
  const { error } = await supabase
    .from("initiative")
    .upsert({
      user_id: userId,
      enabled: settings.enabled,
      hours: settings.hours,
      type: settings.type,
      last_message_at: settings.lastMessageAt ?? null
    }, { onConflict: "user_id" });

  if (error) throw error;
}

export async function getLatestUserMessage(userId) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, user_id, role, message, content, created_at")
    .eq("user_id", userId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    role: data.role,
    message: data.message,
    content: data.content,
    createdAt: data.created_at
  };
}
