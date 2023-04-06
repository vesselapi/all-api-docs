import fs from "fs";
import * as babel from "@babel/core";

const plugin = ({ types: t }: { types: any }) => {
  return {
    visitor: {
      FunctionDeclaration(path: any) {
        if (path.node.id.name !== "createRequest") return;
        // Replace the function body with the return params
        path
          .get("body")
          .replaceWith(
            t.blockStatement([
              t.returnStatement(t.arrayExpression(path.node.params)),
            ])
          );
      },
    },
  };
};

function ReplaceCreateRequestResponse(file: string) {
  const fileContents = fs.readFileSync(file, "utf8");
  if (!babel.transformSync) {
    return {};
  }

  const transformedCode = babel.transformSync(fileContents, {
    plugins: [plugin],
    ast: true,
  });
  if (!transformedCode) return;
  fs.writeFileSync(file, transformedCode.code as any);
}

async function main() {
  ReplaceCreateRequestResponse(
    "node_modules/@vesselapi/integrations/dist/index.js"
  );
}

main().catch(console.error);
