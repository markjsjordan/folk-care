const { Client } = require("pg");
require("dotenv").config({ path: "/Users/markjordan/folk-care/.env" });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const orgs = await client.query("SELECT id, name FROM organizations");
  console.log("ALL ORGS:", JSON.stringify(orgs.rows));
  const branches = await client.query("SELECT id, organization_id, name FROM branches");
  console.log("ALL BRANCHES:", JSON.stringify(branches.rows));
  await client.end();
})();
