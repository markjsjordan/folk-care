const jwt = require("jsonwebtoken");
require("dotenv").config({ path: "/Users/markjordan/folk-care/.env", quiet: true });

const orgId = process.argv[2];
const branchId = process.argv[3];

const payload = {
  userId: "00000000-0000-0000-0000-000000000003",
  email: "admin@folkcare.example",
  organizationId: orgId,
  branchIds: [branchId],
  roles: ["SUPER_ADMIN"],
  permissions: ["*:*"],
  tokenVersion: 0,
};

const token = jwt.sign(payload, process.env.JWT_SECRET, {
  expiresIn: "15m",
  issuer: "folkcare",
  audience: "folkcare-api",
});

process.stdout.write(token);
