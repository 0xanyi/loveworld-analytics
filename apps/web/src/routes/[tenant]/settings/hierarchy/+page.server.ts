import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { serverApiFetch } from "$lib/server/api";

export const load: PageServerLoad = async ({ params, cookies }) => {
  const res = await serverApiFetch(`/tenants/${params.tenant}/hierarchy`, { cookies });

  if (!res.ok) {
    error(res.status, "Failed to load hierarchy");
  }

  const body = (await res.json()) as { nodes: unknown[] };
  return { nodes: body.nodes };
};

export const actions: Actions = {
  create: async ({ request, params, cookies }) => {
    const form = await request.formData();
    const res = await serverApiFetch(`/tenants/${params.tenant}/hierarchy`, {
      cookies,
      method: "POST",
      body: {
        type: form.get("type"),
        name: form.get("name"),
        slug: form.get("slug"),
        parentId: form.get("parentId") || null,
      },
    });

    if (!res.ok) {
      return fail(res.status, { error: "Failed to create node" });
    }

    return { success: true };
  },
  rename: async ({ request, params, cookies }) => {
    const form = await request.formData();
    const id = String(form.get("id"));
    const res = await serverApiFetch(`/tenants/${params.tenant}/hierarchy/${id}`, {
      cookies,
      method: "PATCH",
      body: {
        name: form.get("name"),
      },
    });

    if (!res.ok) {
      return fail(res.status, { error: "Failed to rename node" });
    }

    return { success: true };
  },
  archive: async ({ request, params, cookies }) => {
    const form = await request.formData();
    const id = String(form.get("id"));
    const res = await serverApiFetch(`/tenants/${params.tenant}/hierarchy/${id}`, {
      cookies,
      method: "DELETE",
    });

    if (!res.ok) {
      return fail(res.status, { error: "Failed to archive node" });
    }

    return { success: true };
  },
};
