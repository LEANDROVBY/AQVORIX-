import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const d = JSON.parse(fs.readFileSync('data/vybe-data.json', 'utf8'));
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const messages = (d.messages ?? []).map(x => ({
  id: x.id,
  user_id: x.userId,
  role: x.role,
  message: x.message ?? null,
  content: x.content ?? x.message ?? null,
  created_at: x.createdAt
}));

const users = Object.entries(d.users ?? {}).map(([userId, x]) => ({
  user_id: userId,
  pro: !!x.pro,
  pro_until: x.proUntil ?? null
}));

const initiatives = Object.entries(d.initiative ?? {}).map(([userId, x]) => ({
  user_id: userId,
  enabled: x.enabled ?? true,
  hours: x.hours ?? 12,
  type: x.type ?? 'casual',
  last_message_at: x.lastMessageAt ?? null
}));

const a = await supabase
  .from('messages')
  .upsert(messages, { onConflict: 'id' });

if (a.error) throw a.error;

const b = await supabase
  .from('users')
  .upsert(users, { onConflict: 'user_id' });

if (b.error) throw b.error;

if (initiatives.length > 0) {
  const c = await supabase
    .from('initiative')
    .upsert(initiatives, { onConflict: 'user_id' });

  if (c.error) throw c.error;
}

console.log('MIGRACION OK');
console.log('Mensajes:', messages.length);
console.log('Usuarios:', users.length);
console.log('Iniciativas:', initiatives.length);
