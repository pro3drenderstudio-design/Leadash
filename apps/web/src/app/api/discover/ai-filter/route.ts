import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import OpenAI from "openai";

const client = new OpenAI();

const PEOPLE_SYSTEM = `You are a lead search filter parser. Convert natural language queries into structured JSON filter parameters.

Available filter fields (include only fields that are clearly implied):
- titleIncludes: string[] — job titles to find (e.g. ["CEO", "CTO"])
- titleExcludes: string[] — job titles to exclude
- seniorities: string[] — from: owner, founder, c_suite, partner, vp, head, director, manager, senior, entry, intern
- departments: string[] — from: executive, finance, engineering, design, operations, it, human_resources, sales, marketing, business_development, consulting, customer_service, legal, accounting, media_and_comms
- locationIncludes: string[] — countries, states, or cities (e.g. ["United States", "New York"])
- locationExcludes: string[] — locations to exclude
- companyIncludes: string[] — specific company names
- companyExcludes: string[] — company names to exclude
- industryIncludes: string[] — industries (e.g. ["Technology", "Software", "Financial Services"])
- industryExcludes: string[] — industries to exclude
- companySizes: string[] — from: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+
- emailStatus: "has_email" | "verified" | "any"

Return ONLY a valid JSON object. No explanation, no markdown.`;

const COMPANY_SYSTEM = `You are a company search filter parser. Convert natural language queries into structured JSON filter parameters.

Available filter fields (include only fields clearly implied):
- coKeyword: string — keyword search
- coLocationIncludes: string[] — countries, states, or cities
- coLocationExcludes: string[] — locations to exclude
- coIndustryIncludes: string[] — industries (e.g. ["SaaS", "FinTech", "Healthcare"])
- coIndustryExcludes: string[] — industries to exclude
- coSizes: string[] — from: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+
- coFundingStages: string[] — from: Pre-Seed, Seed, Series A, Series B, Series C, Series D, Series E, IPO, Acquired, Private Equity
- coHasPeople: boolean — only companies with known contacts

Return ONLY a valid JSON object. No explanation, no markdown.`;

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  let body: { query?: string; mode?: string };
  try {
    body = await req.json() as { query?: string; mode?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { query, mode } = body;
  if (!query?.trim()) return NextResponse.json({ error: "query required" }, { status: 400 });

  const system = mode === "companies" ? COMPANY_SYSTEM : PEOPLE_SYSTEM;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 512,
      messages: [
        { role: "system", content: system },
        { role: "user",   content: query.trim() },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const filters = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return NextResponse.json({ filters });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-filter]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
