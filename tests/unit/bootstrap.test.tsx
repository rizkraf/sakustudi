import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import Home from "../../app/routes/home";

const HomeRoute = Home as unknown as (props: {
  loaderData: { message: string };
}) => React.JSX.Element;

describe("bootstrap", () => {
  it("renders the generated home route", () => {
    render(
      <MemoryRouter>
        <HomeRoute loaderData={{ message: "Hello from Express" }} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { level: 1 }),
    ).toHaveTextContent("Hello from Express");
  });
});
