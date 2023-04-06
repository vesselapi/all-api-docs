/**
 * # Description
 * This script auto generates our entire docs.
 *
 * NOTE: Unified yaml files must still be written by hand.
 */
import { integrationsList } from "@vesselapi/integrations";

import buildIntegrationYaml from "./build-integration-yaml";
import createApiReferences from "./create-api-references";
import { title } from "radash";

const CategoriesToSkip = ["crm"];

export async function main() {
  // The full set of "integrations" includes the "unified" API which
  // we treat as it's own integration for doc purposes.
  const integrations: {
    integration: string;
    page: string;
    group: { name: string; id: string; order: number };
  }[] = [];
  const categorySet: Set<string> = new Set();
  integrationsList.forEach((integration) => {
    const category = integration.display.categories[0];

    if (!CategoriesToSkip.includes(category)) {
      categorySet.add(category);
    }
    integrations.push({
      integration: integration.id,
      page: "actions",
      group: { name: integration.display.name, id: integration.id, order: 2 },
    });
  });

  // Build yamls for each integration
  // NOTE: Assumption is that each integration should be shown under the first
  // category in the categories list.
  for (const { integration, page } of integrations) {
    console.log(`\nStarting write yaml: ${integration}`);
    await buildIntegrationYaml({
      integration,
      page,
      overwrite: true,
    });
  }

  const allDocs = [
    ...integrations,
    ...Array.from(categorySet).map((c) => ({
      integration: c,
      page: "unified",
      group: { name: `${title(c)} API`, id: c, order: 1 },
    })),
  ];

  for (const doc of allDocs) {
    await createApiReferences({ ...doc, overwrite: true });
  }
}

main().catch(console.error);
