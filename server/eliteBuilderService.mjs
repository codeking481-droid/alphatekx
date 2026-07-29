import { randomUUID } from "node:crypto";
import { supabaseServiceHeaders } from "./supabaseHeaders.mjs";

export const BUILDER_COST = 2;
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

const missingTable = (message) =>
  /(?:relation\s+["']?(?:public\.)?builder_projects["']?\s+does not exist|could not find the table\s+["']?public\.builder_projects|schema cache.*builder_projects)/i.test(
    String(message || ""),
  );
const missingColumn = (message) =>
  /(?:column\s+(?:builder_projects\.)?["']?[a-z_]+["']?\s+does not exist|could not find the\s+["']?[a-z_]+["']?\s+column.*builder_projects)/i.test(
    String(message || ""),
  );
const headers = (config) => supabaseServiceHeaders(config.service);

async function request(config, path, init = {}) {
  if (!config.url || !config.service)
    throw new Error("Builder database is not configured on the server.");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(config), ...(init.headers || {}) },
  });
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }
  if (!response.ok) {
    const message =
      payload?.message || payload?.error || `Builder database returned HTTP ${response.status}.`;
    if (missingTable(message))
      throw Object.assign(
        new Error(
          "Builder storage is not installed in production. Apply supabase/elite-builder.sql to the connected Supabase project.",
        ),
        { code: "BUILDER_SCHEMA_MISSING" },
      );
    if (missingColumn(message))
      throw Object.assign(
        new Error(
          "Builder storage is outdated. Apply the latest supabase/elite-builder.sql migration to add the required columns.",
        ),
        { code: "BUILDER_SCHEMA_OUTDATED" },
      );
    throw new Error(String(message));
  }
  return payload;
}

const isBuilderSchemaError = (error) =>
  ["BUILDER_SCHEMA_MISSING", "BUILDER_SCHEMA_OUTDATED"].includes(error?.code);

const missingMissionColumn = (error, column) =>
  new RegExp(
    `(?:could not find the\\s+["']?${column}["']?\\s+column\\s+of\\s+["']?missions|column\\s+(?:missions\\.)?["']?${column}["']?\\s+does not exist)`,
    "i",
  ).test(String(error?.message || error || ""));

function legacyProject(row = {}) {
  return {
    ...row,
    prompt: row.prompt || row.title || "Builder project",
    provider: row.provider || "alpha-compatible-storage",
    public_url: row.public_url || row.deployment_url || null,
    published: row.published === true,
    charged: true,
    views: Number(row.views || 0),
    versions: Array.isArray(row.versions) ? row.versions : [],
  };
}

async function saveLegacyProject(config, user, input) {
  const id = input.id || randomUUID();
  const title = String(input.title || "Untitled build")
    .trim()
    .slice(0, 120);
  const description = String(input.prompt || title).slice(0, 6000);
  const mission = {
    id,
    user_id: user.id,
    title,
    goal: description,
    status: "active",
    progress: 100,
  };
  try {
    await request(config, "missions", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(mission),
    });
  } catch (error) {
    if (!missingMissionColumn(error, "goal")) throw error;
    // Newer AlphaTekx installations use `description`; older ones require
    // `goal`. Retry only the rejected insert so no duplicate mission is made.
    const { goal: _legacyGoal, ...compatibleMission } = mission;
    await request(config, "missions", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ ...compatibleMission, description }),
    });
  }
  const rows = await request(config, "creations", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id,
      mission_id: id,
      user_id: user.id,
      owner_id: user.id,
      title,
      code: String(input.code || ""),
      type: "builder-v3",
      status: "ready",
      files: [],
      versions: [],
      published: false,
    }),
  });
  return legacyProject(rows?.[0] || { id, title, code: input.code, prompt: input.prompt });
}

export function normalizeBuilderCode(value) {
  let code = String(value || "").trim();
  const fence = code.match(/```(?:jsx|tsx|javascript|js)?\s*([\s\S]*?)```/i);
  if (fence) code = fence[1].trim();
  code = code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, "")
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, "")
    .replace(/\bexport\s+default\s+function\s+App\b/, "function App")
    .replace(/\bexport\s+default\s+App\s*;?/g, "")
    .replace(/\bexport\s+(?=(?:const|function|class)\s+)/g, "")
    .trim();
  return code;
}

export function validateBuilderCode(value) {
  const raw = String(value || "");
  const code = normalizeBuilderCode(value);
  const errors = [];
  if (code.length < 300) errors.push("The generated application was incomplete.");
  if (!/(?:function|const)\s+App\b/.test(code))
    errors.push("The generated application did not define App.");
  if (!/\breturn\s*\(?\s*</.test(code))
    errors.push("The generated application did not render interface markup.");
  if (/\b(?:eval|Function)\s*\(/.test(code))
    errors.push("The generated application contained unsafe dynamic execution.");
  if (/<script\b/i.test(code))
    errors.push("The generated component contained an embedded script tag.");
  if (/^\s*import\s/m.test(raw))
    errors.push("The generated application depended on unavailable imports.");
  if (/\b(?:ReactDOM\.)?createRoot\s*\(/.test(code))
    errors.push("The generated application attempted to mount itself.");
  if (/(?<!React\.)\b(?:useState|useEffect|useMemo|useReducer|useRef)\s*\(/.test(code))
    errors.push("The generated application used an unavailable bare React hook.");
  return { code, errors };
}

export async function listProjects(config, user) {
  try {
    const rows = await request(
      config,
      `builder_projects?user_id=eq.${encodeURIComponent(user.id)}&charged=eq.true&select=id,slug,title,prompt,code,provider,public_url,published,views,versions,created_at,updated_at&order=created_at.desc&limit=50`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    const rows = await request(
      config,
      `creations?user_id=eq.${encodeURIComponent(user.id)}&type=eq.builder-v3&select=id,slug,title,code,deployment_url,published,versions,created_at&order=created_at.desc&limit=50`,
    );
    return Array.isArray(rows) ? rows.map(legacyProject) : [];
  }
}

export async function findProjectByRequest(config, user, requestId) {
  try {
    const rows = await request(
      config,
      `builder_projects?user_id=eq.${encodeURIComponent(user.id)}&request_id=eq.${encodeURIComponent(requestId)}&select=*&limit=1`,
    );
    return rows?.[0] || null;
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    const rows = await request(
      config,
      `creations?id=eq.${encodeURIComponent(requestId)}&user_id=eq.${encodeURIComponent(user.id)}&type=eq.builder-v3&select=*&limit=1`,
    );
    return rows?.[0] ? legacyProject(rows[0]) : null;
  }
}

export async function getOwnerProject(config, user, id) {
  try {
    const rows = await request(
      config,
      `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,
    );
    return rows?.[0] || null;
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    const rows = await request(
      config,
      `creations?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&type=eq.builder-v3&select=*&limit=1`,
    );
    return rows?.[0] ? legacyProject(rows[0]) : null;
  }
}

export async function updateProjectCode(config, user, id, code, provider) {
  const current = await getOwnerProject(config, user, id);
  const versions = Array.isArray(current?.versions) ? current.versions : [];
  const nextVersions = current?.code
    ? [
        ...versions,
        {
          id: randomUUID(),
          code: current.code,
          provider: current.provider || "alpha",
          created_at: new Date().toISOString(),
        },
      ].slice(-20)
    : versions;
  let rows;
  try {
    rows = await request(
      config,
      `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          code,
          provider,
          versions: nextVersions,
          updated_at: new Date().toISOString(),
        }),
      },
    );
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    rows = await request(
      config,
      `creations?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&type=eq.builder-v3`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ code, versions: nextVersions }),
      },
    );
    rows = rows?.map(legacyProject);
  }
  if (!rows?.length)
    throw Object.assign(new Error("This build could not be found in your account."), {
      status: 404,
    });
  return rows[0];
}

export async function requestCustomDomain(config, user, id, domain, token) {
  const normalized = String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized)) {
    throw Object.assign(new Error("Enter a valid domain such as app.example.com."), {
      status: 400,
    });
  }
  const rows = await request(
    config,
    `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        custom_domain: normalized,
        domain_status: "pending_dns",
        domain_verification_token: token,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!rows?.length)
    throw Object.assign(new Error("This build could not be found."), { status: 404 });
  return {
    project: rows[0],
    domain: normalized,
    verification: { type: "TXT", name: `_alphatekx.${normalized}`, value: token },
  };
}

export async function saveGeneratedProject(config, user, input) {
  const id = input.id || randomUUID();
  const record = {
    id,
    user_id: user.id,
    // A private draft slug keeps this compatible with older installations
    // where the original builder_projects.slug column was declared NOT NULL.
    slug: `draft-${String(id).replace(/-/g, "").slice(0, 20)}`,
    title: String(input.title || "Untitled build")
      .trim()
      .slice(0, 120),
    prompt: String(input.prompt || "")
      .trim()
      .slice(0, 6000),
    code: String(input.code || ""),
    provider: String(input.provider || "alpha"),
    request_id: String(input.requestId || id),
    charged: false,
    published: false,
    updated_at: new Date().toISOString(),
  };
  try {
    const rows = await request(config, "builder_projects", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(record),
    });
    return rows?.[0] || record;
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    return saveLegacyProject(config, user, { ...input, id });
  }
}

export async function markProjectCharged(config, user, id) {
  let rows;
  try {
    rows = await request(
      config,
      `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ charged: true, updated_at: new Date().toISOString() }),
      },
    );
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    rows = await request(
      config,
      `creations?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&type=eq.builder-v3&select=*`,
      { headers: { Prefer: "return=representation" } },
    );
    rows = rows?.map(legacyProject);
  }
  if (!rows?.length) throw new Error("Builder could not finalize the verified project.");
  return rows[0];
}

export async function deleteProject(config, user, id) {
  try {
    await request(
      config,
      `builder_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      },
    );
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    await request(
      config,
      `creations?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}&type=eq.builder-v3`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    await request(
      config,
      `missions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    ).catch(() => {});
  }
}

export async function deployProject(config, user, input, baseUrl) {
  const id = String(input.id || "");
  const slug = String(input.slug || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw Object.assign(new Error("Select a generated project before deploying."), { status: 400 });
  if (!SLUG_PATTERN.test(slug))
    throw Object.assign(
      new Error(
        "Use 3–30 lowercase letters, numbers, or hyphens. Start and end with a letter or number.",
      ),
      { status: 400 },
    );
  let compatibleStorage = false;
  let conflict;
  try {
    conflict = await request(
      config,
      `builder_projects?slug=eq.${encodeURIComponent(slug)}&id=neq.${encodeURIComponent(id)}&select=id&limit=1`,
    );
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    compatibleStorage = true;
    conflict = await request(
      config,
      `creations?slug=eq.${encodeURIComponent(slug)}&id=neq.${encodeURIComponent(id)}&select=id&limit=1`,
    );
  }
  if (conflict?.length)
    throw Object.assign(new Error("That Builder address is already taken. Choose another slug."), {
      status: 409,
    });
  const appBase = new URL(String(baseUrl));
  const publicUrl =
    appBase.hostname === "alphatekx.name.ng"
      ? `${appBase.protocol}//${slug}.alphatekx.name.ng`
      : `${String(baseUrl).replace(/\/$/, "")}/b/${slug}`;
  const pathUrl = `${String(baseUrl).replace(/\/$/, "")}/b/${slug}`;
  let rows = await request(
    config,
    `${compatibleStorage ? "creations" : "builder_projects"}?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(
        compatibleStorage
          ? { slug, deployment_url: publicUrl, published: true, status: "deployed" }
          : { slug, public_url: publicUrl, published: true, updated_at: new Date().toISOString() },
      ),
    },
  );
  if (compatibleStorage) rows = rows?.map(legacyProject);
  if (!rows?.length)
    throw Object.assign(new Error("This build could not be found in your account."), {
      status: 404,
    });
  return { project: rows[0], publicUrl, pathUrl };
}

export async function getPublicProject(config, slug) {
  if (!SLUG_PATTERN.test(String(slug || ""))) return null;
  let compatibleStorage = false;
  let rows;
  try {
    rows = await request(
      config,
      `builder_projects?slug=eq.${encodeURIComponent(slug)}&published=eq.true&select=id,slug,title,code,public_url,views,created_at&limit=1`,
    );
  } catch (error) {
    if (!isBuilderSchemaError(error)) throw error;
    compatibleStorage = true;
    rows = await request(
      config,
      `creations?slug=eq.${encodeURIComponent(slug)}&published=eq.true&type=eq.builder-v3&select=id,slug,title,code,deployment_url,created_at&limit=1`,
    );
  }
  const project = rows?.[0] ? (compatibleStorage ? legacyProject(rows[0]) : rows[0]) : null;
  if (!project) return null;
  let views = Number(project.views || 0);
  try {
    if (compatibleStorage) return project;
    const incremented = await request(config, "rpc/increment_builder_views", {
      method: "POST",
      body: JSON.stringify({ slug_param: slug }),
    });
    if (Number.isFinite(Number(incremented))) views = Number(incremented);
  } catch (error) {
    console.warn(
      "[Elite Builder] Atomic view increment unavailable:",
      error instanceof Error ? error.message : error,
    );
  }
  return { ...project, views };
}
