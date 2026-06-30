import postgres from "postgres";

const db = postgres(
  "postgres://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@89.117.51.235:5432/leadash_leads",
  { ssl: { rejectUnauthorized: false }, max: 1 }
);

const [r] = await db`
  SELECT
    COUNT(*)::bigint                                                              AS total_rows,
    COUNT(CASE WHEN email IS NOT NULL AND email <> '' THEN 1 END)::bigint        AS with_email,
    COUNT(CASE WHEN phone IS NOT NULL AND phone <> '' THEN 1 END)::bigint        AS with_phone
  FROM discover_people
`;

console.log("Total rows:  ", r.total_rows.toLocaleString());
console.log("With email:  ", r.with_email.toLocaleString());
console.log("With phone:  ", r.with_phone.toLocaleString());

await db.end();
