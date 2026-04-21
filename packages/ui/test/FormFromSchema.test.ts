import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import FormFromSchema from "../src/lib/components/FormFromSchema.svelte";

describe("FormFromSchema", () => {
  afterEach(cleanup);

  it("renders supported field types and submits nested payloads", async () => {
    const onSubmit = vi.fn();

    render(FormFromSchema, {
      schema: {
        type: "object",
        required: ["name", "visits", "status", "settings"],
        properties: {
          name: { type: "string", title: "Name" },
          visits: { type: "integer", title: "Visits" },
          status: { type: "string", enum: ["active", "paused"], title: "Status" },
          published: { type: "boolean", title: "Published" },
          settings: {
            type: "object",
            title: "Settings",
            required: ["start"],
            properties: {
              start: { type: "string", title: "Start" },
            },
          },
        },
      },
      initialValue: {
        published: true,
        settings: { start: "2026-01-01" },
      },
      onSubmit,
    });

    await fireEvent.input(screen.getByLabelText("Name *"), {
      target: { value: "Manual Source" },
    });
    await fireEvent.input(screen.getByLabelText("Visits *"), {
      target: { value: "42" },
    });
    await fireEvent.change(screen.getByLabelText("Status *"), {
      target: { value: "paused" },
    });
    await fireEvent.click(screen.getByLabelText("Published"));
    await fireEvent.input(screen.getByLabelText("Start *"), {
      target: { value: "2026-02-01" },
    });

    await fireEvent.submit(screen.getByRole("button", { name: "Submit" }).closest("form")!);

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Manual Source",
      visits: 42,
      status: "paused",
      published: false,
      settings: {
        start: "2026-02-01",
      },
    });
  });

  it("supports select overrides for schema fields", async () => {
    const onSubmit = vi.fn();

    render(FormFromSchema, {
      schema: {
        type: "object",
        required: ["hierarchyNodeId"],
        properties: {
          hierarchyNodeId: { type: "string", title: "Hierarchy node" },
        },
      },
      overrides: {
        hierarchyNodeId: {
          options: [
            { value: "node-1", label: "Station A" },
            { value: "node-2", label: "Station B" },
          ],
        },
      },
      onSubmit,
    });

    await fireEvent.change(screen.getByLabelText("Hierarchy node *"), {
      target: { value: "node-2" },
    });

    await fireEvent.submit(screen.getByRole("button", { name: "Submit" }).closest("form")!);

    expect(onSubmit).toHaveBeenCalledWith({ hierarchyNodeId: "node-2" });
  });
});
