require('dotenv').config({ path: '.env.local' });
async function checkUnconfirmedUsers() {
  const MGMT = "https://api.supabase.com/v1/projects/iojiahkehnijxxczrgft/database/query";
  const r = await fetch(MGMT, { 
    method: "POST", 
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }, 
    body: JSON.stringify({ query: "SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NULL" }) 
  });
  console.log("Unconfirmed:", await r.text());
}
checkUnconfirmedUsers();
