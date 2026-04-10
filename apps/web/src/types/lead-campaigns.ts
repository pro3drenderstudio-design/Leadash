// ─── Lead Generation Campaign Types ──────────────────────────────────────────

export type LeadCampaignMode   = "scrape" | "verify_personalize" | "full_suite";
export type LeadCampaignStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type VerificationStatus = "pending" | "valid" | "invalid" | "catch_all" | "disposable" | "unknown";
export type CreditTxType       = "grant" | "purchase" | "reserve" | "consume" | "refund";

export interface LeadCampaign {
  id:                  string;
  workspace_id:        string;
  name:                string;
  mode:                LeadCampaignMode;
  status:              LeadCampaignStatus;
  apify_actor_id?:     string | null;
  apify_run_id?:       string | null;
  apify_input?:        ApifyLeadScraperInput | null;
  source_list_id?:     string | null;
  verify_enabled:      boolean;
  personalize_enabled: boolean;
  personalize_prompt?: string | null;
  max_leads:           number;
  total_scraped:       number;
  total_verified:      number;
  total_personalized:  number;
  total_valid:         number;
  credits_reserved:    number;
  credits_used:        number;
  personalize_valid_only: boolean;
  source_campaign_id?: string | null;
  error_message?:      string | null;
  started_at?:         string | null;
  completed_at?:       string | null;
  created_at:          string;
}

export interface LeadCampaignLead {
  id:                   string;
  workspace_id:         string;
  campaign_id:          string;
  email:                string;
  first_name?:          string | null;
  last_name?:           string | null;
  company?:             string | null;
  title?:               string | null;
  website?:             string | null;
  linkedin_url?:        string | null;
  phone?:               string | null;
  location?:            string | null;
  industry?:            string | null;
  // Extended fields
  department?:          string | null;
  seniority?:           string | null;
  org_city?:            string | null;
  org_state?:           string | null;
  org_country?:         string | null;
  org_size?:            string | null;
  org_linkedin_url?:    string | null;
  org_description?:     string | null;
  org_founded_year?:    string | null;
  // Enrichment
  verification_status?: VerificationStatus | null;
  verification_score?:  number | null;
  personalized_line?:   string | null;
  added_to_list_id?:    string | null;
  added_at?:            string | null;
  created_at:           string;
}

export interface LeadCreditTransaction {
  id:               string;
  workspace_id:     string;
  amount:           number;
  type:             CreditTxType;
  description?:     string | null;
  lead_campaign_id?: string | null;
  created_at:       string;
}

export interface CreditBalance {
  balance:      number;
  transactions: LeadCreditTransaction[];
}

export interface CreditPack {
  id:              string;
  credits:         number;
  price_usd:       number;
  stripe_price_id: string;
  label?:          string;
}

// Cost per lead per mode
export const CREDIT_COSTS: Record<LeadCampaignMode, number> = {
  scrape:             1,
  verify_personalize: 3,
  full_suite:         4,
};

// ─── Apify Lead Scraper (pipelinelabs~lead-scraper-apollo-zoominfo-lusha-ppe) ──

export const APIFY_ACTOR_ID = "pipelinelabs~lead-scraper-apollo-zoominfo-lusha-ppe";

export const JOB_TITLES = [
  "Director", "Manager", "Founder", "General Manager", "Consultant",
  "Chief Executive Officer", "Co-Founder", "Account Manager", "Chief Financial Officer",
  "Human Resources Manager", "Director Of Marketing", "Executive Director",
  "Chief Operating Officer", "Account Executive", "Business Development Manager",
  "Chief Technology Officer", "Chief Information Officer", "Founder & CEO", "Attorney",
  "IT Manager", "Engineer", "Business Analyst", "Chief Marketing Officer",
  "Creative Director", "Director Of Sales", "Analyst", "Business Owner",
  "Branch Manager", "HR Director", "Customer Service Representative",
  "Co-Founder & CEO", "IT Director", "Finance Manager", "Developer",
  "Engineering Manager", "Key Account Manager", "Executive Vice President",
  "Financial Analyst", "Financial Advisor", "Data Analyst", "Data Scientist",
  "CEO & Founder", "Director Of Finance", "Associate Director", "Customer Success Manager",
  "Head Of Marketing", "CEO And Founder", "Founder/CEO", "HR Coordinator",
  "Head Of Sales", "Head Of Product", "Head Of Operations", "Head Of IT",
  "Head Of Human Resources", "Head Of Business Development", "Chief Revenue Officer",
  "Chief Product Officer", "Chief People Officer", "Chief Of Staff",
  "Business Development Director", "Inside Sales Representative", "Full Stack Developer",
  "Digital Marketing Manager", "Digital Marketing Director", "Community Manager",
  "Content Marketing Manager", "Product Manager", "Project Manager",
  "Operations Manager", "Sales Manager", "Marketing Manager",
] as const;

export const SENIORITY_LEVELS = [
  "Entry", "Senior", "Manager", "Director", "VP", "C-Suite",
  "Owner", "Head", "Founder", "Partner", "Intern",
] as const;

export const JOB_FUNCTIONS = [
  "Accounting", "Administrative", "Arts & Design", "Business Development",
  "Consulting", "Data Science", "Education", "Engineering", "Entrepreneurship",
  "Finance", "Human Resources", "Information Technology", "Legal", "Marketing",
  "Media & Communications", "Operations", "Product Management", "Research",
  "Sales", "Support",
] as const;

export const INDUSTRIES = [
  "Technology", "Software", "SaaS", "Healthcare", "Finance", "Banking",
  "Real Estate", "Education", "Manufacturing", "Retail", "E-commerce",
  "Marketing & Advertising", "Consulting", "Legal Services", "Media",
  "Telecommunications", "Transportation", "Construction", "Energy",
  "Non-profit", "Government", "Hospitality", "Insurance", "Automotive",
  "Aerospace", "Pharmaceuticals", "Biotechnology", "Food & Beverage",
  "Fashion & Apparel", "Sports & Entertainment",
] as const;

export const EMPLOYEE_SIZES = [
  "1-10", "11-50", "51-200", "201-500", "501-1000",
  "1001-5000", "5001-10000", "10001+",
] as const;

export const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "India",
  "Germany", "France", "Netherlands", "Sweden", "Norway", "Denmark",
  "Switzerland", "Spain", "Italy", "Portugal", "Ireland", "Belgium",
  "Austria", "Finland", "New Zealand", "Singapore", "Israel",
  "United Arab Emirates", "South Africa", "Brazil", "Mexico",
  "Argentina", "Colombia", "Chile", "Japan", "South Korea",
  "Philippines", "Malaysia", "Indonesia", "Poland", "Czech Republic",
  "Romania", "Hungary", "Turkey", "Saudi Arabia",
] as const;

export interface ApifyLeadScraperInput {
  totalResults?:                  number;
  emailStatus?:                   "verified" | "unverified";
  hasEmail?:                      boolean;
  hasPhone?:                      boolean;
  personTitleIncludes?:           string[];
  personTitleExcludes?:           string[];
  personTitleExtraIncludes?:      string[];
  seniorityIncludes?:             string[];
  seniorityExcludes?:             string[];
  personFunctionIncludes?:        string[];
  personFunctionExcludes?:        string[];
  personLocationCountryIncludes?: string[];
  personLocationCountryExcludes?: string[];
  personLocationStateIncludes?:   string[];
  personLocationStateExcludes?:   string[];
  personLocationCityIncludes?:    string[];
  personLocationCityExcludes?:    string[];
  companyNamesIncludes?:          string[];
  companyNamesExcludes?:          string[];
  industryIncludes?:              string[];
  industryExcludes?:              string[];
  companyKeywordIncludes?:        string[];
  companyKeywordExcludes?:        string[];
  companyDomainIncludes?:         string[];
  companyDomainExcludes?:         string[];
  companyHeadcountIncludes?:      string[];
  startOffset?:                   number;
}

export type PersonalizationDepth = "standard" | "deep";
export type ToneOfVoice = "professional" | "casual" | "friendly" | "direct";
