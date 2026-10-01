// src/backend/scratch/inspect_org_accounts.ts
import { supabaseAdmin } from '../config/supabase';

async function checkOrgs() {
  console.log('--- ORGANIZATIONS ---');
  const { data: orgs, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .select('*');

  if (orgErr) {
    console.error('Error fetching orgs:', orgErr);
    return;
  }

  console.log(`Total organizations found: ${orgs?.length || 0}`);
  for (const org of orgs || []) {
    console.log({
      id: org.id,
      name: org.name,
      email: org.email,
      owner_email: org.owner_email,
      calendar_provider: org.calendar_provider,
      calendar_link: org.calendar_link,
      has_google_refresh_token: !!org.google_refresh_token,
      google_refresh_token_len: org.google_refresh_token?.length,
      has_google_user_refresh_token: !!org.google_user_refresh_token,
      google_user_refresh_token_len: org.google_user_refresh_token?.length,
      has_google_client_id: !!org.google_client_id,
      has_google_client_secret: !!org.google_client_secret,
      has_microsoft_refresh_token: !!org.microsoft_refresh_token,
      opens_on_holidays: org.opens_on_holidays,
    });
  }

  console.log('\n--- TEAM MEMBERS ---');
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('team_members')
    .select('*');

  if (teamErr) {
    console.error('Error fetching team members:', teamErr);
  } else {
    console.log(`Total team members: ${team?.length || 0}`);
    for (const member of team || []) {
      console.log({
        id: member.id,
        org_id: member.org_id,
        email: member.email,
        role: member.role,
      });
    }
  }

  console.log('\n--- RECENT BOOKINGS ---');
  const { data: bookings, error: bookErr } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (bookErr) {
    console.error('Error fetching bookings:', bookErr);
  } else {
    console.log(`Recent bookings: ${bookings?.length || 0}`);
    for (const b of bookings || []) {
      console.log(b);
    }
  }
}

checkOrgs().catch(console.error);
