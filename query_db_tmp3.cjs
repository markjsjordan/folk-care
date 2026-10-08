const { Client } = require("pg");
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: "/Users/markjordan/folk-care/.env" });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const orgId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  // Inspect organizations/branches/users columns to insert minimally-valid rows
  const orgCols = await client.query(`
    SELECT column_name, is_nullable, column_default FROM information_schema.columns
    WHERE table_name = 'organizations' ORDER BY ordinal_position
  `);
  console.log("ORG COLUMNS:", JSON.stringify(orgCols.rows));

  const branchCols = await client.query(`
    SELECT column_name, is_nullable, column_default FROM information_schema.columns
    WHERE table_name = 'branches' ORDER BY ordinal_position
  `);
  console.log("BRANCH COLUMNS:", JSON.stringify(branchCols.rows));

  await client.end();
})();
