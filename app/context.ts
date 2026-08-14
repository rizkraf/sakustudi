import { createContext } from "react-router";

export const valueFromExpressContext = createContext<string>(
  "Hello from React Router",
);
