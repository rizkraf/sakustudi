export default [
  {
    ignores: [
      "node_modules/**",
      "build/**",
      ".react-router/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "public/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "error",
      eqeqeq: "error",
    },
  },
];
