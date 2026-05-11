export interface DiscoverCompany {
  id:            string;
  name:          string;
  domain:        string | null;
  industry:      string | null;
  size_range:    string | null;
  country:       string | null;
  state:         string | null;
  city:          string | null;
  linkedin_url:  string | null;
  website:       string | null;
}

export interface DiscoverPerson {
  id:              string;
  company_id:      string | null;
  first_name:      string | null;
  last_name:       string | null;
  title:           string | null;
  seniority:       string | null;
  department:      string | null;
  linkedin_url:    string | null;
  email:           string | null;
  email_status:    "verified" | "extrapolated" | "unverified" | "invalid" | "risky";
  phone:           string | null;
  country:         string | null;
  state:           string | null;
  city:            string | null;
  company_name:    string | null;
  company_domain:  string | null;
  company_industry:string | null;
  company_size:    string | null;
}

export interface DiscoverResult extends Omit<DiscoverPerson, "email" | "phone"> {
  email_preview:   string | null;
  phone_preview:   string | null;
  has_email:       boolean;
  has_phone:       boolean;
  revealed:        boolean;
  exported:        boolean;
}

export interface DiscoverCompanyResult {
  id:             string;
  name:           string;
  domain:         string | null;
  website_url:    string | null;
  linkedin_url:   string | null;
  industry:       string | null;
  size_range:     string | null;
  employee_count: number | null;
  revenue_usd:    number | null;
  funding_stage:  string | null;
  funding_total:  number | null;
  country:        string | null;
  state:          string | null;
  city:           string | null;
  description:    string | null;
  keywords:       string | null;
  people_count:   number;
}

export const FUNDING_STAGE_OPTIONS = [
  "Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Series E",
  "Private Equity", "IPO", "Acquired",
] as const;

export const EMPLOYEE_RANGE_OPTIONS = [
  { label: "1–10",       min: 1,     max: 10    },
  { label: "11–50",      min: 11,    max: 50    },
  { label: "51–200",     min: 51,    max: 200   },
  { label: "201–500",    min: 201,   max: 500   },
  { label: "501–1,000",  min: 501,   max: 1000  },
  { label: "1,001–5,000",min: 1001,  max: 5000  },
  { label: "5,001–10,000",min:5001,  max: 10000 },
  { label: "10,001+",   min: 10001,  max: 0     },
] as const;

export const REVENUE_RANGE_OPTIONS = [
  { label: "< $1M",       min: 0,          max: 1_000_000      },
  { label: "$1M–$10M",    min: 1_000_000,  max: 10_000_000     },
  { label: "$10M–$50M",   min: 10_000_000, max: 50_000_000     },
  { label: "$50M–$100M",  min: 50_000_000, max: 100_000_000    },
  { label: "$100M–$1B",   min: 100_000_000,max: 1_000_000_000  },
  { label: "$1B+",        min: 1_000_000_000, max: 0           },
] as const;

export interface DiscoverPersonDetail extends DiscoverPerson {
  company_website: string | null;
  coworkers:       DiscoverResult[];
}

export interface DiscoverCompanyDetail {
  id:           string;
  name:         string;
  domain:       string | null;
  website_url:  string | null;
  linkedin_url: string | null;
  industry:     string | null;
  size_range:   string | null;
  country:      string | null;
  state:        string | null;
  city:         string | null;
  description:  string | null;
  keywords:     string | null;
  people:       DiscoverResult[];
  people_total: number;
}

export interface SavedSearch {
  id:         string;
  name:       string;
  mode:       "people" | "companies";
  filters:    Record<string, unknown>;
  created_at: string;
}

export interface DiscoverSearchParams {
  q?:             string;
  title?:         string;
  seniority?:     string;
  department?:    string;
  country?:       string;
  city?:          string;
  company?:       string;
  industry?:      string;
  company_size?:  string;
  email_status?:  "any" | "has_email" | "verified";
  page?:          number;
  limit?:         number;
}

export interface DiscoverSearchResponse {
  results:          DiscoverResult[];
  total:            number;
  page:             number;
  limit:            number;
  credits_per_lead: number;
}

export interface DiscoverCompanySearchResponse {
  results: DiscoverCompanyResult[];
  total:   number;
  page:    number;
  limit:   number;
}

export interface DiscoverExportRequest {
  ids:           string[];
  format:        "csv" | "campaign" | "list";
  campaign_id?:  string | null;
  campaign_name?:string | null;
  list_id?:      string | null;
  list_name?:    string | null;
}

export interface RevealResponse {
  reveals:          Record<string, { email: string | null; phone: string | null; email_status: string | null }>;
  credits_used:     number;
  already_revealed: number;
}

export const SENIORITY_OPTIONS: { label: string; value: string }[] = [
  { label: "Owner",      value: "owner" },
  { label: "Founder",    value: "founder" },
  { label: "C-Suite",    value: "c_suite" },
  { label: "Partner",    value: "partner" },
  { label: "VP",         value: "vp" },
  { label: "Head",       value: "head" },
  { label: "Director",   value: "director" },
  { label: "Manager",    value: "manager" },
  { label: "Senior",     value: "senior" },
  { label: "Entry",      value: "entry" },
  { label: "Intern",     value: "intern" },
];

export const DEPARTMENT_OPTIONS: { label: string; value: string }[] = [
  { label: "Sales",               value: "sales" },
  { label: "Marketing",           value: "marketing" },
  { label: "Engineering",         value: "engineer" },
  { label: "Finance",             value: "finance" },
  { label: "Operations",          value: "operations" },
  { label: "Human Resources",     value: "human resources" },
  { label: "IT",                  value: "information technology" },
  { label: "Legal",               value: "legal" },
  { label: "Design",              value: "design" },
  { label: "Customer Service",    value: "customer service" },
  { label: "Consulting",          value: "consulting" },
  { label: "Management",          value: "manager" },
  { label: "Business Development",value: "business development" },
  { label: "Healthcare",          value: "health" },
  { label: "Education",           value: "education" },
];

export const COMPANY_SIZE_OPTIONS = [
  "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+",
] as const;

export const INDUSTRY_OPTIONS = [
  "Information Technology & Services",
  "Marketing & Advertising",
  "Construction",
  "Hospital & Health Care",
  "Real Estate",
  "Computer Software",
  "Financial Services",
  "Retail",
  "Education Management",
  "Accounting",
  "Management Consulting",
  "Staffing & Recruiting",
  "Telecommunications",
  "Internet",
  "Automotive",
  "Health, Wellness & Fitness",
  "Insurance",
  "Oil & Energy",
  "Food & Beverages",
  "Banking",
  "Architecture & Planning",
  "Logistics & Supply Chain",
  "Legal Services",
  "Electrical & Electronic Manufacturing",
  "Consumer Goods",
  "Facilities Services",
  "Human Resources",
  "Wholesale",
  "Restaurants",
  "Civil Engineering",
  "Government Administration",
  "Pharmaceuticals",
  "Building Materials",
  "Medical Practice",
  "Outsourcing/Offshoring",
  "Mechanical or Industrial Engineering",
  "Events Services",
  "Transportation/Trucking/Railroad",
  "Environmental Services",
  "Non-Profit Organization Management",
  "Media Production",
  "Professional Training & Coaching",
  "Design",
  "Publishing",
  "Biotechnology",
  "Semiconductors",
  "Renewables & Environment",
  "Business Supplies & Equipment",
  "Entertainment",
  "International Trade & Development",
  "Market Research",
  "Mining & Metals",
  "Chemicals",
  "Aviation & Aerospace",
  "Packaging & Containers",
  "Textiles",
  "Sporting Goods",
  "Cosmetics",
  "Fund-Raising",
  "Luxury Goods & Jewelry",
] as const;

export const DISCOVER_SENIORITY_OPTIONS   = SENIORITY_OPTIONS.map(o => o.label);
export const DISCOVER_COMPANY_SIZE_OPTIONS = COMPANY_SIZE_OPTIONS;
