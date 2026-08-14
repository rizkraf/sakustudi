import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "../../app/routes/home";

const HomeRoute = Home as unknown as (props: {
  loaderData: { message: string };
}) => React.JSX.Element;

describe("bootstrap", () => {
  it("renders the generated home route", () => {
    render(<HomeRoute loaderData={{ message: "Hello from Express" }} />);

    expect(
      screen.getByRole("heading", { level: 1 }),
    ).toHaveTextContent("Hello from Express");
  });
});
