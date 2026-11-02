-- P1: the assembly plant becomes its own branch. For an organisation that has
-- plant records (vehicles in the plant, kits, shipments, PDIs) but no branch
-- of kind ASSEMBLY_PLANT yet, this:
--   1. opens "Afprint Assembly Plant" (code KWL-AP, SAP plant 1100) in the same
--      business unit and city as the branch holding the records, with the
--      plant's departments;
--   2. moves every plant record onto it (nothing is deleted);
--   3. moves the people whose roles are plant roles only (plant manager, PDI,
--      kit and quality roles) onto it, keeping their department by slug;
--   4. writes one audit entry with the counts.
-- An organisation that already has an assembly plant is left alone, so this
-- is safe to run more than once. Rename the branch or change its SAP plant
-- code under Branches afterwards.
DO $$
DECLARE
  rec record; plant text; dept_id text; moved_v int; moved_k int; moved_s int; moved_p int; moved_u int;
BEGIN
  IF to_regclass('public.plant_vehicles') IS NULL OR to_regclass('public.plant_kits') IS NULL THEN
    RETURN;
  END IF;
  FOR rec IN
    SELECT b."businessUnitId", b."cityId", b.id AS from_branch, bu."organisationId"
    FROM branches b
    JOIN business_units bu ON bu.id = b."businessUnitId"
    WHERE b.type <> 'ASSEMBLY_PLANT'
      AND (EXISTS (SELECT 1 FROM plant_vehicles v WHERE v."branchId" = b.id)
        OR EXISTS (SELECT 1 FROM plant_kits k WHERE k."branchId" = b.id)
        OR EXISTS (SELECT 1 FROM pdi_inspections p WHERE p."branchId" = b.id))
      AND NOT EXISTS (SELECT 1 FROM branches x JOIN business_units xu ON xu.id = x."businessUnitId" WHERE xu."organisationId" = bu."organisationId" AND x.type = 'ASSEMBLY_PLANT')
    ORDER BY b."createdAt"
  LOOP
    -- One plant per organisation: a second stranded branch of the same organisation reuses it.
    SELECT x.id INTO plant FROM branches x JOIN business_units xu ON xu.id = x."businessUnitId" WHERE xu."organisationId" = rec."organisationId" AND x.type = 'ASSEMBLY_PLANT' LIMIT 1;
    IF plant IS NULL THEN
      plant := rec."businessUnitId" || '-afprint-seed';
      INSERT INTO branches (id, "businessUnitId", "cityId", name, code, type, "sapPlant", "isActive", hotlines, "createdAt", "updatedAt")
        VALUES (plant, rec."businessUnitId", rec."cityId", 'Afprint Assembly Plant', 'KWL-AP', 'ASSEMBLY_PLANT', '1100', true, '{}', now(), now())
        ON CONFLICT (id) DO UPDATE SET type = 'ASSEMBLY_PLANT', "sapPlant" = COALESCE(branches."sapPlant", '1100');
      INSERT INTO departments (id, "branchId", name, slug, "isActive", "createdAt", "updatedAt")
        SELECT gen_random_uuid()::text, plant, d.name, d.slug, true, now(), now() FROM (VALUES
          ('Kit receiving & plant store', 'plant-kit-receiving'), ('Production (the line)', 'plant-production'), ('Quality (QC and QA audit)', 'plant-quality'),
          ('PDI', 'plant-pdi'), ('Yard & dispatch', 'plant-yard'), ('Plant maintenance', 'plant-maintenance')) AS d(name, slug)
        ON CONFLICT ("branchId", slug) DO NOTHING;
    END IF;
    UPDATE plant_vehicles SET "branchId" = plant, "sapPlant" = (SELECT "sapPlant" FROM branches WHERE id = plant) WHERE "branchId" = rec.from_branch; GET DIAGNOSTICS moved_v = ROW_COUNT;
    UPDATE plant_kits SET "branchId" = plant WHERE "branchId" = rec.from_branch; GET DIAGNOSTICS moved_k = ROW_COUNT;
    UPDATE plant_shipments SET "branchId" = plant WHERE "branchId" = rec.from_branch; GET DIAGNOSTICS moved_s = ROW_COUNT;
    UPDATE pdi_inspections SET "branchId" = plant WHERE "branchId" = rec.from_branch; GET DIAGNOSTICS moved_p = ROW_COUNT;
    -- People with plant roles only (never someone who also works in the workshop or runs the organisation).
    UPDATE users u SET "branchId" = plant,
      "departmentId" = (SELECT d.id FROM departments d WHERE d."branchId" = plant AND d.slug = CASE
        WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug IN ('pdi-inspector', 'pdi-supervisor')) THEN 'plant-pdi'
        WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug = 'kit-inspector') THEN 'plant-kit-receiving'
        WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug = 'quality-supervisor') THEN 'plant-quality'
        ELSE 'plant-production' END)
      WHERE u."branchId" = rec.from_branch
        AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug IN ('plant-manager', 'pdi-inspector', 'pdi-supervisor', 'kit-inspector', 'quality-supervisor'))
        AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = u.id AND r.slug NOT IN ('plant-manager', 'pdi-inspector', 'pdi-supervisor', 'kit-inspector', 'quality-supervisor'));
    GET DIAGNOSTICS moved_u = ROW_COUNT;
    INSERT INTO audit_logs (id, "organisationId", "userId", action, "entityType", "entityId", metadata, "createdAt")
      VALUES (gen_random_uuid()::text, rec."organisationId", NULL, 'branch.plant_records_moved', 'Branch', plant,
        jsonb_build_object('from', (SELECT name FROM branches WHERE id = rec.from_branch), 'to', 'Afprint Assembly Plant', 'sapPlant', '1100', 'by', 'deploy',
          'vehicles', moved_v, 'kits', moved_k, 'shipments', moved_s, 'pdis', moved_p, 'people', moved_u), now());
  END LOOP;
END
$$;
