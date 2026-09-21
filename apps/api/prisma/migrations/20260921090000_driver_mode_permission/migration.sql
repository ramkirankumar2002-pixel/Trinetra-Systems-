INSERT INTO "Permission" ("id", "code", "name", "group")
SELECT 'perm_driver_mode', 'driver.mode', 'Open weighbridge driver mode', 'weighbridges'
WHERE NOT EXISTS (
  SELECT 1 FROM "Permission" WHERE "code" = 'driver.mode'
);

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT concat('rp_driver_', r."id"), r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."code" = 'driver.mode'
  AND r."code" IN ('ADMIN', 'WEIGHBRIDGE_OPERATOR', 'SUPERVISOR')
  AND NOT EXISTS (
    SELECT 1
    FROM "RolePermission" rp
    WHERE rp."roleId" = r."id"
      AND rp."permissionId" = p."id"
  );
