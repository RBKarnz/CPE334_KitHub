import { render, screen } from "@testing-library/react";
import App from "../src/App";

describe("App", () => {
  it("shows the KitHub name", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "KitHub" })).toBeInTheDocument();
  });
});
