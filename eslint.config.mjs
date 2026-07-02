// Relative import: the repo root is not a workspace package, so pnpm does not
// symlink @opzava/config into the root node_modules. ESLint resolves this file
// from the repo root, so reference the shared config by path.
import baseConfig from "./packages/config/eslint/base.mjs";

export default baseConfig;
