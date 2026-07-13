const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const h = {"Content-Type":"application/json","apikey":KEY,"Authorization":`Bearer ${KEY}`};
  const baseUrl = "https://iojiahkehnijxxczrgft.supabase.co/auth/v1/admin/users";
  
  console.log("Starting bulk password reset...");
  let page = 1;
  let allUsers = [];
  
  while (true) {
    const url = `${baseUrl}?page=${page}&per_page=50`;
    const response = await fetch(url, {headers: h}).then(r => r.json());
    
    if (!response || !response.users) {
      console.error("Failed to extract users array or end of list reached.", response);
      break;
    }
    
    const users = response.users;
    if (users.length === 0) break;
    
    allUsers = allUsers.concat(users);
    page++;
  }
  
  console.log(`Found ${allUsers.length} users. Resetting passwords...`);
  
  let updatedCount = 0;
  for (const u of allUsers) {
    if (!u.email || u.email === "admin@schoolaid.com") continue;
    
    try {
      const res = await fetch(`${baseUrl}/${u.id}`, {
        method: "PUT",
        headers: h,
        body: JSON.stringify({ password: "school123" })
      });
      
      if (!res.ok) {
        console.error(`Failed to reset password for ${u.email}:`, await res.text());
      } else {
        updatedCount++;
        if (updatedCount % 50 === 0) console.log(`Reset ${updatedCount} passwords so far...`);
      }
    } catch (err) {
      console.error(`Error processing ${u.email}:`, err);
    }
  }
  console.log(`Done! Successfully reset passwords for ${updatedCount} users.`);
}

if (!KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
} else {
  main();
}
