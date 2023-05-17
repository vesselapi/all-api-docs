/**
 * # Description
 * This script is used to auto generate the ap-reference md files given a yaml.
 */
import * as fs from "fs";
import * as yaml from "js-yaml";
import { capitalize, sleep } from "radash";
import { Mint } from "./mint";

type Args = {
  page: string;
  integration: string;
  group: { name: string; id: string; order: number };
  overwrite: boolean;
};

type File = {
  name: string;
  data: string;
};

const getCaveats = (path: string): { caveats: Record<string, any> } => {
  if (fs.existsSync(path)) {
    const ycaveots = fs.readFileSync(path, "utf8");
    return yaml.load(ycaveots) as { caveats: {} };
  }
  return { caveats: {} };
};

const getYaml = (path: string) => {
  if (fs.existsSync(path)) {
    const yamlIn = fs.readFileSync(path, "utf8");
    return yaml.load(yamlIn) as {
      paths: { [key: string]: any };
      components: { schemas: { [key: string]: any } };
    };
  }
  throw new Error(`No yaml found at path: ${path}`);
};

export default async function main(args: Args) {
  const { page, integration, group } = args;

  // load yamls
  const yamlPath = `../docs/pages/${page}/${integration}/${integration}.yaml`;
  const caveatsPath = `../docs/pages/${page}/${integration}/caveats-${integration}.yaml`;

  const yamlData = getYaml(yamlPath);
  const caveats = getCaveats(caveatsPath);

  const mint = Mint();
  mint.resetGroup(group.id);

  for (const [pathName, path] of Object.entries(yamlData.paths)) {
    const requestExample =
      path.post.requestBody?.content["application/json"]?.examples["example-1"]
        .value ?? {};
    const cav = caveats.caveats[pathName];

    // TODO: Make this more generic to all headers
    const hasAccessToken = path.post.parameters?.find(
      (header: any) => header.name === "x-vessel-access-token"
    );

    const mdExample: File = {
      name: path.post.operationId,
      data: `---
openapi: "POST ${pathName}"
---

<RequestExample>

\`\`\`bash Request
curl --request POST \\
  --url https://app.vessel.dev/${pathName} \\
  --header 'Content-Type: application/json' \\
  --header 'x-vessel-api-token: ' \\
  ${
    hasAccessToken
      ? `--header 'x-vessel-access-token: '\\ \n  --data '${JSON.stringify(
          requestExample,
          null,
          2
        )}'`
      : `--data '${JSON.stringify(requestExample, null, 2)}'`
  }
\`\`\`

</RequestExample>

${cav ? `*Caveats*\n${cav}` : ""}
      `,
    };

    const referencePath = `../docs/pages/${page}/${integration}/api-reference/${mdExample.name}.mdx`;
    if (args.overwrite || !fs.existsSync(referencePath)) {
      console.log("Writing reference: ", mdExample.name);
      // Create the mdx file
      fs.mkdir(
        referencePath.replace(`/${mdExample.name}.mdx`, ""),
        { recursive: true },
        () => {}
      );
      await sleep(50);

      fs.writeFileSync(referencePath, mdExample.data);

      // Add to the mint config
      mint.addPath(
        group,
        capitalize(pathName.split("/")[4]),
        referencePath.replace("../docs/", "").replace(".mdx", "")
      );
    } else {
      console.log("Skipping - already exists", mdExample.name);
    }
  }

  mint.save();
}
