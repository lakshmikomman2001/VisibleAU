/**
 * One-time backfill: seed org_members owner row for every org that has a users.role='owner'.
 * Idempotent (ON CONFLICT DO NOTHING on unique(organization_id, user_id)).
 *
 * Usage:
 *   node scripts/backfill-org-members-owner.mjs postgresql://postgres:password@localhost:5432/visibleau
 *   node scripts/backfill-org-members-owner.mjs postgresql://postgres:password@localhost:5432/visibleau_prod
 */
import postgres from "postgres";

const connStr = process.argv[2];
if (!connStr) {
  console.error("Usage: node scripts/backfill-org-members-owner.mjs <DATABASE_URL>");
  process.exit(1);
}

const sql = postgres(connStr);

const owners = await sql`
  SELECT u.id AS user_id, u.organization_id, u.email
  FROM users u
  WHERE u.role = 'owner'`;

console.log(`Found ${owners.length} owner users`);

let seeded = 0;
const skipped = [];

for (const owner of owners) {
  const [result] = await sql`
    INSERT INTO org_members (id, organization_id, user_id, role, brand_access, accepted_at, is_active, invited_by, updated_at)
    VALUES (gen_random_uuid(), ${owner.organization_id}, ${owner.user_id}, 'owner', NULL, NOW(), true, ${owner.user_id}, NOW())
    ON CONFLICT (organization_id, user_id) DO NOTHING
    RETURNING id`;

  if (result) {
    console.log(`  + seeded owner for org ${owner.organization_id} (${owner.email})`);
    seeded++;
  } else {
    console.log(`  = already exists for org ${owner.organization_id} (${owner.email})`);
  }
}

const orgsWithoutOwner = await sql`
  SELECT o.id, o.name FROM organizations o
  LEFT JOIN users u ON u.organization_id = o.id AND u.role = 'owner'
  WHERE u.id IS NULL`;

if (orgsWithoutOwner.length > 0) {
  console.log(`\nWARNING: ${orgsWithoutOwner.length} org(s) have no users.role='owner' — skipped:`);
  for (const org of orgsWithoutOwner) {
    console.log(`  ! ${org.id} (${org.name})`);
  }
}

console.log(`\nDone. Seeded ${seeded} owner rows. ${owners.length - seeded} already existed.`);
await sql.end();
