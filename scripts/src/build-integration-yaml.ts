/**
 * # Description
 * This script auto generates our integrations yaml
 */
import * as fs from "fs";
import { integrationsList } from "@vesselapi/integrations";
import * as yaml from "js-yaml";
import { JSONSchemaFaker } from "json-schema-faker";
import zodToJsonSchema from "zod-to-json-schema";
import { camel, sleep } from "radash";
import { Mint } from "./mint";

JSONSchemaFaker.option({
  alwaysFakeOptionals: true,
  maxItems: 1,
  failOnInvalidTypes: false,
  failOnInvalidFormat: false,
  defaultRandExpMax: 100,
  reuseProperties: false,
  resolveJsonPath: true,
});

function deepOmit(obj: any, keysToOmit: any): any {
  if (Array.isArray(obj)) {
    return obj.map((item) => deepOmit(item, keysToOmit));
  } else if (typeof obj === "object" && obj !== null) {
    return Object.keys(obj).reduce((acc: any, currKey) => {
      if (!keysToOmit.includes(currKey)) {
        acc[currKey] = deepOmit(obj[currKey], keysToOmit);
      }
      return acc;
    }, {});
  } else {
    return obj;
  }
}

function deepCamelCaseKeys(obj: any, exclude: string[] = []): any {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((val) => deepCamelCaseKeys(val, exclude));
  }

  const newObj: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!exclude.includes(key)) {
      const newKey = camel(key);
      newObj[newKey] = deepCamelCaseKeys(value, exclude);
    } else {
      newObj[key] = deepCamelCaseKeys(value, exclude);
    }
  }

  return newObj;
}

function getResponse(integration: any, action: any): any {
  switch (integration.id) {
    case "teams":
      switch (action.resource) {
        case "teams":
          return integration.client.groups[camel(action.operation)];
        default:
          return integration.client.teams[camel(action.resource)][
            camel(action.operation)
          ];
      }
    default:
      return integration.client[camel(action.resource)][
        camel(action.operation)
      ];
  }
}

type Args = {
  page: string;
  integration: string;
  overwrite: boolean;
};

function addSpace(str: string, num: number) {
  return str.trim().replace(/^/gm, " ".repeat(num));
}

export default async function main(args: Args) {
  const { integration: name, page } = args;
  const integration = integrationsList.find((i) => i.id === name);

  if (!integration) {
    console.error(`Integration ${name} not found`);
    process.exit(1);
  }

  const mint = Mint();

  // Build the yaml from the actions
  const yamlBase = `
openapi: 3.1.0
info:
  title: ${integration.display.name} API Reference
  version: "1.0"
  summary: API
servers:
  - url: "https://app.vessel.dev"
security:
  - VesselAPIToken: []`;

  let yamlPaths = ``;
  for (const action of integration.rawActions ?? []) {
    // NOTE: We're making a pretty big assumption here that actions and client are
    // 1:1 since we can't get the response schema from the client.
    const response = getResponse(integration, action);

    if (!response) {
      throw new Error(
        `No schema found for action: ${integration.id} -> ${action.resource} -> ${action.operation}`
      );
    }

    const excludeJson = ["$schema", "additionalProperties", "$ref"];
    const responseJson = deepOmit(
      zodToJsonSchema(response[0]({ properties: {} }).schema) as any,
      excludeJson
    ) as Record<string, any>;
    const requestJson = deepOmit(
      zodToJsonSchema(action.schema),
      excludeJson
    ) as Record<string, any>;

    const responseYaml = deepCamelCaseKeys(
      responseJson.properties ?? responseJson
    );
    const requestYaml = deepCamelCaseKeys(
      requestJson.properties ?? requestJson
    );

    if (!responseYaml || !requestYaml) {
      console.error(
        `WARNING: No response or request schema found for action: ${integration.id} -> ${action.resource} -> ${action.operation}`
      );
    }

    responseYaml.$native = {
      type: "object",
      description: "The raw response from the integration, unmodified.",
    };

    yamlPaths += `  /api/actions/${integration.id}/${action.resource}/${
      action.operation
    }:
    post:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
${addSpace(yaml.dump(responseYaml), 19)}
              examples:
                example-1:
                  value:
${addSpace(yaml.dump(JSONSchemaFaker.generate(responseYaml)), 21)}
      requestBody: 
        content:
          application/json:
            schema:
              type: object
              properties:
${addSpace(yaml.dump(requestYaml), 17)}
            examples:
              example-1:
                value:
${addSpace(yaml.dump(JSONSchemaFaker.generate(requestYaml)), 21)}
      operationId: ${action.name}
      parameters:
      - name: x-vessel-access-token
        in: header
        description: Access Token
        required: true
        schema:
          type: string
    parameters: []
`;
  }

  // --------------------
  // Add the passthrough!
  yamlPaths += `  /api/passthrough/${integration.id}:
    post:
      summary: Passthrough Request
      operationId: passthrough
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                title: responseBody
                description: ""
                type: object
                properties:
                  headers:
                    type: object
                  url:
                    type: string
                    description: The full URL that the request was sent to.
                  statusCode:
                    type: number
                    description: The HTTP status code of the response from the downstream system.
                  body:
                    AnyValue:
                      description: The body of the response from the downstream system.
                required:
                  - id
              examples:
                example-1:
                  value:
                    headers:
                      content-type: application/json
                    url: https://sometool.com/api/v1/endpoint
                    statusCode: 200
                    body:
                      id: 123123123123
                      success: true
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                accessToken:
                  type: string
                method:
                  type: string
                  enum:
                    - GET
                    - POST
                    - PUT
                    - PATCH
                    - DELETE
                path:
                  type: string
                  description: "The path to send the request to. Vessel handles the domain, for example, a request to Salesforce would use 'services/data/v52.0/sobjects/Account' instead of 'https://mydomain.my.salesforce.com/services/data/v52.0/sobjects/Account'."
                body:
                  type: object
                  description: "The body of the request."
                query:
                  type: object
                  description: "The query parameters to send with the request as key value pairs. These are appended to the URL when the request is sent to the integration provider."
              required:
                - accessToken
                - method
                - path
            examples:
              example-1:
                value:
                  accessToken: string
                  method: PATCH
                  path: services/data/v53.0/sobjects/Account/0011A00001XQ4ZUQA1
                  body:
                    - Name: "Vessel"
        description: ""
      description: Send an authenticated passthrough request to the downstream system. This is useful for making requests to endpoints that are not yet supported by Vessel.
`;

  const yamlPath = `../docs/pages/${page}/${name}/${name}.yaml`;
  const yamlData = `${yamlBase}\npaths:\n${yamlPaths}`;

  mint.addOpenApi(`pages/${page}/${name}/${name}.yaml`).save();

  if (args.overwrite || !fs.existsSync(yamlPath)) {
    fs.mkdir(
      yamlPath.replace(`/${name}.yaml`, ""),
      { recursive: true },
      () => {}
    );
    await sleep(50);
    fs.writeFileSync(yamlPath, yamlData);
    console.log("[buildIntegrationYaml] Writing yaml: ", yamlPath);
  } else {
    console.log("Skipping - already exists: ", yamlPath);
  }
}
