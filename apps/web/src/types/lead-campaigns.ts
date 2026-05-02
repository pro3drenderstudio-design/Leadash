// ─── Lead Generation Campaign Types ──────────────────────────────────────────

export type LeadCampaignMode   = "scrape" | "verify" | "verify_personalize" | "full_suite";
export type LeadCampaignStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type VerificationStatus = "pending" | "safe" | "valid" | "invalid" | "catch_all" | "risky" | "dangerous" | "disposable" | "unknown";
export type CreditTxType       = "grant" | "purchase" | "reserve" | "consume" | "refund";
export type JobStatus          = "pending" | "running" | "done" | "failed";

// ─── Lead Campaigns ───────────────────────────────────────────────────────────

export interface LeadCampaign {
  id:                     string;
  workspace_id:           string;
  name:                   string;
  mode:                   LeadCampaignMode;
  status:                 LeadCampaignStatus;
  apify_actor_id?:        string | null;
  apify_run_id?:          string | null;
  apify_input?:           ApifyLeadScraperInput | null;
  source_list_id?:        string | null;
  source_campaign_id?:    string | null;
  verify_enabled:         boolean;
  personalize_enabled:    boolean;
  personalize_prompt?:    string | null;
  personalize_depth?:     PersonalizationDepth;
  personalize_valid_only: boolean;
  max_leads:              number;
  total_scraped:          number;
  total_verified:         number;
  total_personalized:     number;
  total_valid:            number;
  credits_reserved:       number;
  credits_used:           number;
  error_message?:         string | null;
  started_at?:            string | null;
  completed_at?:          string | null;
  created_at:             string;
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
  department?:          string | null;
  seniority?:           string | null;
  org_city?:            string | null;
  org_state?:           string | null;
  org_country?:         string | null;
  org_size?:            string | null;
  org_linkedin_url?:    string | null;
  org_description?:     string | null;
  org_founded_year?:    string | null;
  verification_status?: VerificationStatus | null;
  verification_score?:  number | null;
  personalized_line?:   string | null;
  added_to_list_id?:    string | null;
  added_at?:            string | null;
  created_at:           string;
}

// ─── Standalone verify / enrich jobs ─────────────────────────────────────────
// Used by the Verify Email and AI Enrichment pages (not tied to a campaign).

export interface VerifyResult {
  email:  string;
  status: VerificationStatus;
  score:  number;
}

export interface VerifyBulkJob {
  id:           string;
  workspace_id: string;
  status:       JobStatus;
  total:        number;
  processed:    number;
  safe:         number;
  invalid:      number;
  catch_all:    number;
  risky:        number;
  dangerous:    number;
  disposable:   number;
  unknown:      number;
  credits_used: number;
  error?:       string | null;
  results?:     VerifyResult[] | null;
  completed_at: string | null;
  expires_at:   string | null;
  created_at:   string;
}

export interface LeadInput {
  email?:      string | null;
  first_name?: string | null;
  last_name?:  string | null;
  title?:      string | null;
  company?:    string | null;
  industry?:   string | null;
  website?:    string | null;
}

export interface EnrichedLead extends LeadInput {
  personalized_line: string;
}

export interface EnrichBulkJob {
  id:           string;
  workspace_id: string;
  status:       JobStatus;
  total:        number;
  processed:    number;
  prompt:       string | null;
  credits_used: number;
  error?:       string | null;
  results?:     EnrichedLead[] | null;
  completed_at: string | null;
  expires_at:   string | null;
  created_at:   string;
}

// ─── Credits ──────────────────────────────────────────────────────────────────

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

// Per-operation costs (fractional credits)
export const CREDIT_COSTS = {
  scrape:             1.0,
  verify:             0.5,
  ai_personalize:     0.5,
  verify_personalize: 0.5,
  full_suite:         1.5,
} as const;

// ─── Apify ────────────────────────────────────────────────────────────────────

export const APIFY_ACTOR_ID = "pipelinelabs~lead-scraper-apollo-zoominfo-lusha-ppe";

export interface ApifyLeadScraperInput {
  totalResults?:                  number;
  emailStatusIncludes?:           ("verified" | "unverified")[];
  hasEmail?:                      boolean;
  hasPhone?:                      boolean;
  personTitleIncludes?:           string[];
  personTitleExcludes?:           string[];
  personTitleExtraIncludes?:      string[];
  includeTitleVariants?:          boolean;
  seniorityIncludes?:             string[];
  seniorityExcludes?:             string[];
  functionIncludes?:              string[];
  functionExcludes?:              string[];
  roleMatchMode?:                 "all" | "any";
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
export type ToneOfVoice          = "professional" | "casual" | "friendly" | "direct";

// ─── Filter options (for campaign creation UI) ────────────────────────────────

export const JOB_TITLES = [
  "Director", "Manager", "Founder", "General Manager", "Consultant",
  "Chief Executive Officer", "Co-Founder", "Account Manager", "Chief Financial Officer",
  "Human Resources Manager", "Director Of Marketing", "Executive Director",
  "Executive Assistant", "Administrative Assistant", "Director Of Human Resources",
  "Associate", "Chief Operating Officer", "HR Manager", "Account Executive",
  "Business Development Manager", "Director Of Operations", "Controller",
  "Chief Technology Officer", "Chief Information Officer", "Founder & CEO", "Attorney",
  "IT Manager", "Assistant Manager", "Engineer", "Business Analyst", "Accountant",
  "Chief Marketing Officer", "Creative Director", "Director Of Sales", "Graphic Designer",
  "Analyst", "Human Resources Director", "Founder And CEO", "Director, Information Technology",
  "Digital Marketing Manager", "Business Owner", "Assistant Professor", "Branch Manager",
  "HR Director", "Administrator", "Customer Service Representative", "HR Business Partner",
  "Co Founder", "Designer", "Intern", "Lecturer", "Architect",
  "Director Of Information Technology", "Information Technology Manager", "Co-Founder & CEO",
  "Co-Owner", "Director, Human Resources", "Business Development", "IT Director",
  "Associate Professor", "Finance Manager", "Director Of Business Development", "Developer",
  "Business Manager", "Director Of Engineering", "Human Resources",
  "Manager, Information Technology", "Customer Service", "Key Account Manager",
  "Executive Vice President", "Financial Analyst", "HR Generalist", "Financial Advisor",
  "Instructor", "Engineering Manager", "Art Director", "Director Of Sales And Marketing",
  "Area Manager", "CEO & Founder", "Director Of Finance", "Data Analyst",
  "Associate Director", "Accounting Manager", "Customer Service Manager",
  "IT Specialist", "Account Director", "Data Scientist", "District Manager",
  "Human Resources Business Partner", "Co-Founder And CEO", "Assistant Principal",
  "Information Technology Director", "Facilities Manager", "Director Human Resources",
  "Exec/Management (Other)", "Area Sales Manager", "Executive", "Human Resources Generalist",
  "Design Engineer", "CEO & Co-Founder", "IT Project Manager",
  "Electrical Engineer", "Finance Director", "Head Of Marketing", "Independent Consultant",
  "Agent", "Brand Manager", "Buyer", "Financial Controller", "Broker",
  "Human Resource Manager", "Adjunct Professor", "Founder, CEO", "Customer Success Manager",
  "Chairman", "CEO And Founder", "Director Of IT",
  "Educator", "Founder/CEO", "IT Consultant", "HR Coordinator", "Co Owner", "Lawyer",
  "Chief Human Resources Officer", "Dentist", "Editor", "Legal Assistant",
  "Director Of Technology", "Interior Designer", "Chief Operations Officer",
  "Business Development Executive", "HR Specialist", "Community Manager",
  "Civil Engineer", "Attorney At Law", "Associate Consultant", "CEO And Co-Founder",
  "General Counsel", "District Sales Manager", "Director Of Product Management",
  "Assistant", "Auditor", "Director, Marketing", "Business Consultant",
  "Assistant Vice President", "Digital Marketing Specialist", "Deputy Manager",
  "Human Resources Coordinator", "Board Member", "IT Analyst",
  "Insurance Agent", "Founding Partner", "Event Manager", "Director Of Development",
  "Co-Founder & CTO", "Database Administrator",
  "Business Development Director", "Enterprise Architect", "Case Manager", "Bookkeeper",
  "Chief Revenue Officer", "Development Manager", "Co-Founder, CEO", "Human Resources Specialist",
  "Doctor", "Assistant Director", "CTO/Cio", "Event Coordinator",
  "Chief Product Officer", "Director Of Digital Marketing", "Application Developer",
  "HR Assistant", "HR Executive",
  "Business Development Representative", "Associate Broker",
  "Director Of Sales & Marketing", "Commercial Manager", "HR Consultant",
  "Finance", "Lead Engineer",
  "Director Of Marketing And Communications", "Manager, Human Resources",
  "Assistant Project Manager", "Application Engineer", "Logistics Manager",
  "Assistant General Manager", "Lead Software Engineer",
  "Founder And President", "Independent Distributor", "Director Of Recruiting",
  "CEO/Founder", "Associate Creative Director", "Assistant Store Manager",
  "Director Of Product Marketing", "Corporate Controller", "Director Of Talent Acquisition",
  "Assistant Controller", "Legal Secretary",
  "Commercial Director", "Chief People Officer", "Inside Sales Representative",
  "Devops Engineer", "Co-Founder And CTO",
  "Field Engineer", "Maintenance Manager", "Field Service Engineer", "Cofounder",
  "Human Resources Assistant", "IT Administrator", "General Sales Manager",
  "Director, Business Development", "Franchise Owner", "Customer Service Supervisor",
  "Benefits Manager", "Inside Sales",
  "Head Of Product", "Management Consultant", "Contracts Manager",
  "CEO/President/Owner", "Associate Software Engineer", "Head Of HR",
  "Internal Auditor", "Head Of Information Technology", "Founder & President",
  "Front Office Manager", "Entrepreneur", "HR Administrator",
  "Director Of Sales Operations", "Data Engineer",
  "Librarian", "Facility Manager", "IT Architect", "Legal Counsel",
  "Maintenance Supervisor", "Head Of Operations", "Founder / CEO", "Chief Strategy Officer",
  "Communications Director", "Development Director", "Content Marketing Manager",
  "Business Systems Analyst",
  "Design Director", "CEO/President", "Manager, Marketing",
  "Lead Developer", "Associate Manager", "Android Developer",
  "IT Department Manager", "IT Engineer", "Credit Analyst",
  "Independent Business Owner", "Head Of Human Resources",
  "Brand Ambassador", "Copywriter", "Chairman & CEO", "Email Marketing Manager",
  "Frontend Developer", "Human Resource Director", "Client Services Manager",
  "IT Support Specialist", "Contract Manager",
  "Chief Medical Officer", "Director Information Technology", "Director Of Product",
  "Director, Product Management", "Country Manager", "Financial Consultant",
  "Business Intelligence Analyst", "Director Marketing", "Loan Officer",
  "Head Of Sales", "Chief Information Officer (Cio)", "IT Recruiter",
  "Information Security Analyst", "Associate General Counsel",
  "Dispatcher", "Contractor", "Design Manager", "Ecommerce Manager", "Chief Technical Officer",
  "Field Service Technician",
  "Director, Talent Acquisition", "Accounting Assistant", "Director, IT", "Account Supervisor",
  "Human Resources Administrator", "Administrative Officer", "Front End Developer",
  "Content Manager", "Maintenance Technician", "Business Development Specialist",
  "Business Development Consultant", "Communications Specialist", "Director, Product Marketing",
  "Client Manager", "Compliance Officer", "Executive Producer", "Customer Service Specialist",
  "Human Resources Executive", "Chief Executive", "HR Advisor",
  "Compliance Manager", "Head Of IT", "IT Business Analyst",
  "Fleet Manager", "CEO & President", "HR Recruiter",
  "Director, Digital Marketing", "Laboratory Technician", "Associate Product Manager",
  "Director Product Management", "Independent Contractor", "Accounts Payable",
  "Digital Marketing Director", "Instructional Designer", "Digital Project Manager",
  "Audit Manager", "Credit Manager", "Business Developer",
  "Head Of Business Development", "Chief Administrative Officer", "Asset Manager",
  "Accounts Payable Specialist", "Chief Compliance Officer",
  "Digital Marketing Executive", "Account Representative", "Campaign Manager",
  "Director, Engineering", "Engagement Manager", "Delivery Manager",
  "Manager Human Resources", "Director Of Product Development",
  "Information Technology Specialist", "Chief Of Staff", "Associate Vice President",
  "Company Director", "Chief Technology Officer (CTO)", "Digital Marketing Consultant",
  "Business Operations Manager", "Director - Human Resources",
  "Customer Experience Manager", "Financial Accountant", "Customer Service Rep",
  "IT Operations Manager", "Management Accountant", "Digital Marketing",
  "Investigator", "Enterprise Account Executive", "Deputy General Manager",
  "Freelance Designer", "Economist", "Digital Marketing Coordinator", "Co-Founder & COO",
  "Chief Architect", "Learning And Development Manager", "Director General",
  "Associate Marketing Manager", "Assistant General Counsel", "Machine Operator",
  "Lead Consultant",
  "Director Of Training", "Financial Representative", "Maintenance",
  "Assistant Accountant", "Financial Manager", "Maintenance Engineer",
  "Contract Administrator", "Finance Officer", "Financial Planner", "Automation Engineer",
  "Accounts Manager", "Customer Service Associate",
  "Investment Banking Analyst", "Director HR",
] as const;

// Display labels shown in the UI — mapped to API enum values via SENIORITY_API_VALUE
export const SENIORITY_LEVELS = [
  "Entry", "Senior", "Manager", "Director", "VP", "C-Suite",
  "Owner", "Partner", "Intern",
] as const;

// Maps UI display label → Apify actor enum value
export const SENIORITY_API_VALUE: Record<string, string> = {
  "Entry":    "entry",
  "Senior":   "senior",
  "Manager":  "manager",
  "Director": "director",
  "VP":       "vp",
  "C-Suite":  "c_suite",
  "Owner":    "owner",
  "Partner":  "partner",
  "Intern":   "intern",
};

// Only the 11 values the Apify actor accepts — mapped via FUNCTION_API_VALUE
export const JOB_FUNCTIONS = [
  "Engineering", "Sales", "Marketing", "Finance", "Operations",
  "Human Resources", "Information Technology", "Business Development",
  "Support", "Education", "Consulting",
] as const;

// Maps UI display label → Apify actor enum value
export const FUNCTION_API_VALUE: Record<string, string> = {
  "Engineering":            "engineering",
  "Sales":                  "sales",
  "Marketing":              "marketing",
  "Finance":                "finance",
  "Operations":             "operations",
  "Human Resources":        "human_resources",
  "Information Technology": "information_technology",
  "Business Development":   "business_development",
  "Support":                "support",
  "Education":              "education",
  "Consulting":             "consulting",
};

export const INDUSTRIES = [
  "Accounting", "Agriculture", "Airlines/Aviation", "Alternative Dispute Resolution",
  "Animation", "Apparel & Fashion", "Architecture & Planning", "Arts & Crafts",
  "Automotive", "Aviation & Aerospace", "Banking", "Biotechnology", "Broadcast Media",
  "Building Materials", "Business Supplies & Equipment", "Capital Markets", "Chemicals",
  "Civic & Social Organization", "Civil Engineering", "Commercial Real Estate",
  "Computer & Network Security", "Computer Games", "Computer Hardware",
  "Computer Networking", "Computer Software", "Construction", "Consumer Electronics",
  "Consumer Goods", "Consumer Services", "Cosmetics", "Dairy", "Defense & Space",
  "Design", "E-Learning", "Education Management", "Electrical/Electronic Manufacturing",
  "Entertainment", "Environmental Services", "Events Services", "Executive Office",
  "Facilities Services", "Farming", "Financial Services", "Fine Art", "Food & Beverages",
  "Food Production", "Fundraising", "Furniture", "Gambling & Casinos",
  "Glass, Ceramics & Concrete", "Government Administration", "Government Relations",
  "Graphic Design", "Health, Wellness & Fitness", "Higher Education",
  "Hospital & Health Care", "Hospitality", "Human Resources", "Import & Export",
  "Individual & Family Services", "Industrial Automation", "Information Services",
  "Information Technology & Services", "Insurance", "International Affairs",
  "International Trade & Development", "Internet", "Investment Banking",
  "Investment Management", "Judiciary", "Law Enforcement", "Law Practice",
  "Legal Services", "Legislative Office", "Leisure, Travel & Tourism", "Libraries",
  "Logistics & Supply Chain", "Luxury Goods & Jewelry", "Machinery",
  "Management Consulting", "Maritime", "Market Research", "Marketing & Advertising",
  "Mechanical or Industrial Engineering", "Media Production", "Medical Devices",
  "Medical Practice", "Mental Health Care", "Military", "Mining & Metals",
  "Motion Pictures & Film", "Museums & Institutions", "Music", "Nanotechnology",
  "Newspapers", "Non-Profit Organization Management", "Oil & Energy", "Online Media",
  "Outsourcing/Offshoring", "Package/Freight Delivery", "Packaging & Containers",
  "Paper & Forest Products", "Performing Arts", "Pharmaceuticals", "Philanthropy",
  "Photography", "Plastics", "Political Organization", "Primary/Secondary Education",
  "Printing", "Professional Training & Coaching", "Program Development", "Public Policy",
  "Public Relations & Communications", "Public Safety", "Publishing",
  "Railroad Manufacture", "Ranching", "Real Estate", "Recreation & Sports",
  "Recreational Facilities & Services", "Religious Institutions", "Renewables & Environment",
  "Research", "Restaurants", "Retail", "Security & Investigations", "Semiconductors",
  "Shipbuilding", "Sporting Goods", "Sports", "Staffing & Recruiting", "Supermarkets",
  "Telecommunications", "Textiles", "Think Tanks", "Tobacco", "Translation & Localization",
  "Transportation/Trucking/Railroad", "Utilities", "Venture Capital & Private Equity",
  "Veterinary", "Warehousing", "Wholesale", "Wine & Spirits", "Wireless", "Writing & Editing",
] as const;

export const EMPLOYEE_SIZES = [
  "1-10", "11-50", "51-200", "201-500", "501-1000",
  "1001-5000", "5001-10000", "10001+",
] as const;

export const COUNTRIES = [
  "United States", "United Kingdom", "India", "France", "Canada",
  "Netherlands", "Brazil", "Australia", "Germany", "Spain", "Italy",
  "Switzerland", "Sweden", "South Africa", "Denmark", "Belgium",
  "Mexico", "Turkey", "United Arab Emirates", "Ireland", "Chile",
  "Argentina", "China", "Norway", "Finland", "Indonesia", "Singapore",
  "Peru", "Japan", "Colombia", "New Zealand", "Poland", "Saudi Arabia",
  "Portugal", "Philippines", "Malaysia", "Pakistan", "Israel", "Austria",
  "Russia", "Hong Kong", "Egypt", "Czech Republic", "Romania", "Nigeria",
  "Greece", "Taiwan", "Luxembourg", "Thailand", "South Korea",
  "Hungary", "Ukraine", "Vietnam", "Bangladesh", "Kenya", "Morocco",
  "Ghana", "Ethiopia", "Tanzania", "Uganda", "Zimbabwe", "Zambia",
  "Serbia", "Croatia", "Slovakia", "Slovenia", "Bulgaria", "Lithuania",
  "Latvia", "Estonia", "Kazakhstan", "Azerbaijan", "Georgia",
  "Armenia", "Belarus", "Moldova", "Albania", "Bosnia And Herzegovina",
  "North Macedonia", "Montenegro", "Malta", "Cyprus", "Iceland",
  "Qatar", "Kuwait", "Bahrain", "Oman", "Jordan", "Lebanon", "Iraq",
  "Iran", "Syria", "Yemen", "Afghanistan", "Sri Lanka", "Nepal",
  "Myanmar", "Cambodia", "Laos", "Mongolia", "Ecuador", "Bolivia",
  "Paraguay", "Uruguay", "Venezuela", "Panama", "Costa Rica",
  "Guatemala", "Honduras", "El Salvador", "Nicaragua", "Dominican Republic",
  "Puerto Rico", "Jamaica", "Trinidad And Tobago", "Barbados",
  "Fiji", "Papua New Guinea",
] as const;
