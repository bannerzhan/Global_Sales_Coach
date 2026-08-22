import { randomUUID } from "crypto";
import { pool } from "../db";
import type { Persona, Scenario } from "./types";
import { isDbAvailable, localGetUser, localSaveUser } from "./storage";

/**
 * 演练场景 repo：createScenario / listScenarios / getScenario。
 * 双后端（PG / 本地 JSON），接口一致。
 */

const SCENARIO_KEY = "scenarios";

function rowToScenario(row: Record<string, unknown>): Scenario {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    category: row.category as string,
    difficulty: Number(row.difficulty ?? 3),
    persona: (row.persona as Persona) ?? { role: "", nationality: "", temperament: "" },
    objectives: Array.isArray(row.objectives) ? (row.objectives as string[]) : [],
    pressureSequence: Array.isArray(row.pressure_sequence)
      ? (row.pressure_sequence as string[])
      : [],
    workContextSeed: (row.work_context_seed as string | null) ?? null,
    openingLine: (row.opening_line as string) ?? "",
    locale: (row.locale as string) ?? "zh-CN",
    createdAt: new Date((row.created_at as string) ?? Date.now()).toISOString(),
  };
}

export async function createScenario(
  data: Omit<Scenario, "id" | "slug" | "createdAt">,
): Promise<Scenario> {
  const scenario: Scenario = {
    id: randomUUID(),
    slug: `s-${randomUUID().slice(0, 8)}`,
    ...data,
    createdAt: new Date().toISOString(),
  };

  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      `INSERT INTO scenarios
         (id, slug, title, category, difficulty, persona, objectives, pressure_sequence, work_context_seed, locale)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        scenario.id,
        scenario.slug,
        scenario.title,
        scenario.category,
        scenario.difficulty,
        JSON.stringify(scenario.persona),
        JSON.stringify(scenario.objectives),
        JSON.stringify(scenario.pressureSequence),
        scenario.workContextSeed,
        scenario.locale,
      ],
    );
    return rowToScenario(rows[0]);
  }

  const data_ = await readScenarios();
  data_.push(scenario);
  await writeScenarios(data_);
  return scenario;
}

export async function listScenarios(): Promise<Scenario[]> {
  if (await isDbAvailable()) {
    const { rows } = await pool.query(
      "SELECT * FROM scenarios WHERE enabled = TRUE ORDER BY created_at DESC LIMIT 50",
    );
    return rows.map(rowToScenario);
  }
  return (await readScenarios()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getScenario(id: string): Promise<Scenario | null> {
  if (await isDbAvailable()) {
    const { rows } = await pool.query("SELECT * FROM scenarios WHERE id = $1", [id]);
    return rows[0] ? rowToScenario(rows[0]) : null;
  }
  const all = await readScenarios();
  return all.find((s) => s.id === id) ?? null;
}

// ---- 本地 JSON 存取（场景库是全局数据，不属于某个 user） ----
async function readScenarios(): Promise<Scenario[]> {
  const user = await localGetUser("__global__");
  return ((user?.[SCENARIO_KEY] as Scenario[] | undefined) ?? []);
}

async function writeScenarios(list: Scenario[]): Promise<void> {
  await localSaveUser("__global__", { [SCENARIO_KEY]: list });
}
