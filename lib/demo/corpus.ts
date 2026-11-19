import profile from "@/data/demo/profile.json";
import points from "@/data/demo/points.json";
import taxonomy from "@/data/demo/taxonomy.json";
import archetypes from "@/data/demo/archetypes.json";
import orgCaps from "@/data/demo/org-caps.json";
import app_archetype_product_management from "@/data/demo/applications/archetype-product-management.json";
import app_archetype_product_strategy from "@/data/demo/applications/archetype-product-strategy.json";
import app_archetype_project_management from "@/data/demo/applications/archetype-project-management.json";
import app_atlas_mobility_product_lead from "@/data/demo/applications/atlas-mobility-product-lead.json";
import app_generic from "@/data/demo/applications/generic.json";
import app_kestrel_ai_pm_platform from "@/data/demo/applications/kestrel-ai-pm-platform.json";
import app_lumen_bank_senior_pm from "@/data/demo/applications/lumen-bank-senior-pm.json";
import app_master from "@/data/demo/applications/master.json";
import app_orchard_commerce_strategy from "@/data/demo/applications/orchard-commerce-strategy.json";
import app_tidewater_health_program_manager from "@/data/demo/applications/tidewater-health-program-manager.json";
import type { CvbSource } from "../import/cvbuilder";

/**
 * The fictional demo corpus (data/demo/), imported as modules so the bundler ships it with
 * the server function. Read from disk instead, it was missing on Vercel (ENOENT on
 * /var/task/data/demo): file tracing only follows imports. Applications in file-name order,
 * as the importer expects. Add a new data/demo/applications file here too
 * (lib/demo/fresh.test.ts fails if one is left out).
 */
export const DEMO_SOURCE: CvbSource = {
  profile,
  points,
  taxonomy,
  archetypes,
  orgCaps,
  applications: [app_archetype_product_management, app_archetype_product_strategy, app_archetype_project_management, app_atlas_mobility_product_lead, app_generic, app_kestrel_ai_pm_platform, app_lumen_bank_senior_pm, app_master, app_orchard_commerce_strategy, app_tidewater_health_program_manager],
};

export const DEMO_APPLICATION_FILES = ["archetype-product-management.json", "archetype-product-strategy.json", "archetype-project-management.json", "atlas-mobility-product-lead.json", "generic.json", "kestrel-ai-pm-platform.json", "lumen-bank-senior-pm.json", "master.json", "orchard-commerce-strategy.json", "tidewater-health-program-manager.json"];
