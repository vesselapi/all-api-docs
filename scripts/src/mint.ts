import * as fs from "fs";
import { title } from "radash";

type MintNavItem =
  | {
      group: string;
      id: string;
      order?: number;
      pages: MintNavItem[];
    }
  | string;

/**
 * Utility functions for working with mint.config
 */
export const Mint = () => {
  const mint = JSON.parse(fs.readFileSync("../docs/mint.json", "utf8"));

  return {
    resetGroup(groupId: string) {
      mint["navigation"] = mint["navigation"].filter(
        (g: any) => g.id !== groupId
      );
      return this;
    },
    addPath(
      groupData: { name: string; id: string; order: number },
      resourceName: string,
      path: string
    ) {
      let group = mint["navigation"].find((g: any) => g.id === groupData.id);
      if (!group) {
        group = {
          group: groupData.name,
          id: groupData.id,
          order: groupData.order,
          pages: [],
        };
        const sorted = [...mint["navigation"], group].sort((g1, g2) => {
          return g1.order - g2.order;
        });
        mint["navigation"] = sorted;
      }

      // TODO: find a better way to do this - special case passthrough
      if (path.includes("passthrough")) {
        group.pages.push(path);
        return this;
      }

      let resourceGroup: MintNavItem | undefined = group.pages?.find(
        (g: any) => g.group === resourceName
      );

      if (!resourceGroup) {
        resourceGroup = {
          group: title(resourceName),
          id: resourceName,
          order: groupData.order,
          pages: [],
        };
        group.pages.push(resourceGroup);
      } else if (typeof resourceGroup === "string") {
        throw new Error(
          `Unexpected string for resourceGroup: ${resourceGroup}`
        );
      }

      resourceGroup.pages.push(path);

      return this;
    },
    addOpenApi(yamlPath: string) {
      mint["openapi"] = [
        ...mint["openapi"].filter((p: string) => p !== yamlPath),
        yamlPath,
      ];
      return this;
    },
    save() {
      fs.writeFileSync("../docs/mint.json", JSON.stringify(mint, null, 2));
      return this;
    },
  };
};
