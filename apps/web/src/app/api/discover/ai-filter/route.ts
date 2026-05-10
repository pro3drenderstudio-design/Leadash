import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import OpenAI from "openai";

const client = new OpenAI();

const PEOPLE_SYSTEM = `You are a lead search filter parser. Convert natural language queries into structured JSON filter parameters.

Available filter fields (include only fields that are clearly implied):
- titleIncludes: string[] — job titles to find (e.g. ["CEO", "CTO", "VP Sales"])
- titleExcludes: string[] — job titles to exclude
- seniorities: string[] — from: owner, founder, c_suite, partner, vp, head, director, manager, senior, entry, intern
- departments: string[] — use substrings that match Apollo detailed_function values. Use simple terms like: sales, marketing, engineer, finance, operations, human resources, information technology, legal, design, customer service, consulting, manager, business development, health, education
- locationIncludes: string[] — countries, states, or cities (e.g. ["United States", "New York", "United Kingdom"])
- locationExcludes: string[] — locations to exclude
- companyIncludes: string[] — specific company names
- companyExcludes: string[] — company names to exclude
- industryIncludes: string[] — use exact Apollo industry names: "Information Technology & Services", "Marketing & Advertising", "Construction", "Hospital & Health Care", "Real Estate", "Computer Software", "Financial Services", "Retail", "Education Management", "Accounting", "Management Consulting", "Staffing & Recruiting", "Telecommunications", "Internet", "Automotive", "Health, Wellness & Fitness", "Insurance", "Oil & Energy", "Food & Beverages", "Banking", "Architecture & Planning", "Logistics & Supply Chain", "Legal Services", "Electrical & Electronic Manufacturing", "Consumer Goods", "Facilities Services", "Human Resources", "Wholesale", "Restaurants", "Civil Engineering", "Government Administration", "Pharmaceuticals", "Building Materials", "Medical Practice", "Outsourcing/Offshoring", "Mechanical or Industrial Engineering", "Events Services", "Transportation/Trucking/Railroad", "Environmental Services", "Non-Profit Organization Management", "Media Production", "Professional Training & Coaching", "Design", "Publishing", "Biotechnology", "Semiconductors", "Renewables & Environment", "Entertainment", "Aviation & Aerospace"
- industryExcludes: string[] — industries to exclude
- companySizes: string[] — from: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+
- emailStatus: "has_email" | "verified" | "any"
- companyKeywordIncludes: string[] — LinkedIn specialties the person's company must have (e.g. ["floor plans", "saas", "solar", "homebuilder"])
- companyKeywordExcludes: string[] — LinkedIn specialties the person's company must NOT have

Return ONLY a valid JSON object. No explanation, no markdown.`;

const COMPANY_SYSTEM = `You are a company search filter parser. Convert natural language queries into structured JSON filter parameters.

Available filter fields (include only fields clearly implied):
- coKeyword: string — keyword search
- coLocationIncludes: string[] — countries, states, or cities (e.g. ["United States", "United Kingdom", "Germany"])
- coLocationExcludes: string[] — locations to exclude
- coIndustryIncludes: string[] — use exact Apollo industry names: "Information Technology & Services", "Marketing & Advertising", "Construction", "Hospital & Health Care", "Real Estate", "Computer Software", "Financial Services", "Retail", "Education Management", "Accounting", "Management Consulting", "Staffing & Recruiting", "Telecommunications", "Internet", "Automotive", "Health, Wellness & Fitness", "Insurance", "Oil & Energy", "Food & Beverages", "Banking", "Architecture & Planning", "Logistics & Supply Chain", "Legal Services", "Pharmaceuticals", "Biotechnology", "Renewables & Environment", "Entertainment", "Aviation & Aerospace"
- coIndustryExcludes: string[] — industries to exclude
- coSizes: string[] — from: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+
- coFundingStages: string[] — from: Pre-Seed, Seed, Series A, Series B, Series C, Series D, Series E, IPO, Acquired, Private Equity
- coHasPeople: boolean — only companies with known contacts
- coKeywordIncludes: string[] — LinkedIn specialties the company must have (e.g. ["floor plans", "homebuilder", "quick move-ins", "saas", "solar"])
- coKeywordExcludes: string[] — LinkedIn specialties the company must NOT have

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
