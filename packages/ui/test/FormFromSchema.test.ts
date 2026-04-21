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

  it("select with no initialValue submits the first visible option", async () => {
    const onSubmit = vi.fn();

    render(FormFromSchema, {
      schema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["fast", "slow"], title: "Mode" },
        },
      },
      onSubmit,
    });

    // No user interaction — submit immediately.
    await fireEvent.submit(screen.getByRole("button", { name: "Submit" }).closest("form")!);

    // Payload must match the visually selected first option, not "".
    expect(onSubmit).toHaveBeenCalledWith({ mode: "fast" });
  });

  it("override select with no initialValue submits the first visible option", async () => {
    const onSubmit = vi.fn();

    render(FormFromSchema, {
      schema: {
        type: "object",
        properties: {
          tier: { type: "string", title: "Tier" },
        },
      },
      overrides: {
        tier: {
          options: [
            { value: "gold", label: "Gold" },
            { value: "silver", label: "Silver" },
          ],
        },
      },
      onSubmit,
    });

    await fireEvent.submit(screen.getByRole("button", { name: "Submit" }).closest("form")!);

    expect(onSubmit).toHaveBeenCalledWith({ tier: "gold" });
  });

  it("renders nested enum, boolean, integer, and deeper objects recursively", async () => {
    const onSubmit = vi.fn();

    render(FormFromSchema, {
      schema: {
        type: "object",
        properties: {
          config: {
            type: "object",
            title: "Config",
            required: ["mode", "active", "limit", "meta"],
            properties: {
              mode: { type: "string", enum: ["fast", "slow"], title: "Mode" },
              active: { type: "boolean", title: "Active" },
              limit: { type: "number", title: "Limit" },
              meta: {
                type: "object",
                title: "Meta",
                required: ["tag"],
                properties: {
                  tag: { type: "string", title: "Tag" },
                },
              },
            },
          },
        },
      },
      initialValue: {
        config: { mode: "fast", active: false, limit: 10, meta: { tag: "v1" } },
      },
      onSubmit,
    });

    // nested enum renders as <select>
    const modeSelect = screen.getByLabelText("Mode *") as HTMLSelectElement;
    expect(modeSelect.tagName).toBe("SELECT");
    await fireEvent.change(modeSelect, { target: { value: "slow" } });

    // nested boolean renders as checkbox
    const activeCheck = screen.getByLabelText("Active *") as HTMLInputElement;
    expect(activeCheck.type).toBe("checkbox");
    await fireEvent.click(activeCheck); // toggle to true

    // nested number renders as number input
    const limitInput = screen.getByLabelText("Limit *") as HTMLInputElement;
    expect(limitInput.type).toBe("number");
    await fireEvent.input(limitInput, { target: { value: "99" } });

    // deeply nested string field
    await fireEvent.input(screen.getByLabelText("Tag *"), { target: { value: "v2" } });

    await fireEvent.submit(screen.getByRole("button", { name: "Submit" }).closest("form")!);

    expect(onSubmit).toHaveBeenCalledWith({
      config: {
        mode: "slow",
        active: true,
        limit: 99,
        meta: { tag: "v2" },
      },
    });
  });
});
