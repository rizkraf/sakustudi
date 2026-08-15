import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import Home from "../../app/routes/home";

const HomeRoute = Home as unknown as (props: {
  loaderData: { deleted: boolean };
}) => React.JSX.Element;

describe("bootstrap", () => {
  it("renders the public landing page", () => {
    render(
      <MemoryRouter>
        <HomeRoute loaderData={{ deleted: false }} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { level: 1 }),
    ).toHaveTextContent("Semua deadline kuliahmu, jelas dalam satu tempat");
    expect(
      screen.getByRole("link", { name: "Daftar" }),
    ).toHaveAttribute("href", "/register");
  });
});
