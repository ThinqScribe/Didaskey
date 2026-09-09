// Use Expo's own generator so typecheck also works before starting Metro.
const path = require("path");
const fs = require("fs");
const { setupTypedRoutes } = require("@expo/cli/build/src/start/server/type-generation/routes");
const typesDirectory = path.resolve(__dirname, "../.expo/types");
fs.mkdirSync(typesDirectory, { recursive: true });
setupTypedRoutes({ typesDirectory, projectRoot: path.resolve(__dirname, ".."), routerDirectory: path.resolve(__dirname, "../app") }).catch(error => { console.error(error); process.exitCode = 1; });
