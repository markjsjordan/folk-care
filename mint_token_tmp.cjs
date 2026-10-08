const jwt = require("jsonwebtoken");
require("dotenv").config({ path: "/Users/markjordan/folk-care/.env" });

const payload = {
  userId: "00000000-0000-0000-0000-000000000003",
  email: "admin@folkcare.example",
  organizationId: "00000000-0000-0000-0000-000000000001",
  branchIds: ["00000000-0000-0000-0000-000000000002"],
  roles: ["SUPER_ADMIN"],
  permissions: ["organizations:*","users:*","clients:*","caregivers:*","visits:*","schedules:*","care-plans:*","tasks:*","billing:*","reports:*","settings:*"],
  tokenVersion: 0,
};

const token = jwt.sign(payload, process.env.JWT_SECRET, {
  expiresIn: "15m",
  issuer: "folkcare",
  audience: "folkcare-api",
});

console.log(token);
