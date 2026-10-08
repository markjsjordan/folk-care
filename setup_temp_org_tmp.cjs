const { Client } = require("pg");
require("dotenv").config({ path: "/Users/markjordan/folk-care/.env" });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const createdBy = "00000000-0000-0000-0000-000000000003"; // existing admin user id, satisfies created_by FK if any

  const orgRes = await client.query(`
    INSERT INTO organizations (name, primary_address, created_by, updated_by, state_code, timezone)
    VALUES ($1, $2::jsonb, $3, $3, 'TX', 'America/Chicago')
    RETURNING id
  `, ['FC-AUDIT-CAREGIVERS Temp Verification Org', JSON.stringify({ line1: '1 Test St', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US' }), createdBy]);
  const orgId = orgRes.rows[0].id;

  const branchRes = await client.query(`
    INSERT INTO branches (organization_id, name, address, created_by, updated_by, timezone)
    VALUES ($1, $2, $3::jsonb, $4, $4, 'America/Chicago')
    RETURNING id
  `, [orgId, 'Temp Verification Branch', JSON.stringify({ line1: '1 Test St', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US' }), createdBy]);
  const branchId = branchRes.rows[0].id;

  console.log(JSON.stringify({ orgId, branchId }));
  await client.end();
})();
