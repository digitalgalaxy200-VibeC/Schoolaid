const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  const key = parts[0];
  const val = parts.slice(1).join('=').trim().replace(/^"/, '').replace(/"$/, '');
  if (key && val) env[key.trim()] = val;
});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: admins } = await supabase.from('school_admins').select('school_id, generated_password, schools(name, slug), profiles(email)').not('generated_password', 'is', null);
  admins?.forEach(a => {
    console.log('School:', a.schools?.name, '| Email:', a.profiles?.email, '| Password:', a.generated_password);
  });
})();
