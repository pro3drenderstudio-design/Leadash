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
  "Associate Director", "Accounting Manager", "Docente", "Customer Service Manager",
  "IT Specialist", "Account Director", "Data Scientist", "District Manager",
  "Human Resources Business Partner", "Co-Founder And CEO", "Assistant Principal",
  "Information Technology Director", "Facilities Manager", "Director Human Resources",
  "Exec/Management (Other)", "Area Sales Manager", "Executive", "Human Resources Generalist",
  "Cashier", "Design Engineer", "CEO & Co-Founder", "IT Project Manager",
  "Electrical Engineer", "Finance Director", "Head Of Marketing", "Independent Consultant",
  "Agent", "Brand Manager", "Buyer", "Financial Controller", "Broker",
  "Human Resource Manager", "Adjunct Professor", "Founder, CEO", "Customer Success Manager",
  "Artist", "Chairman", "Graduate Student", "CEO And Founder", "Director Of IT",
  "Educator", "Founder/CEO", "IT Consultant", "HR Coordinator", "Co Owner", "Lawyer",
  "Chief Human Resources Officer", "Dentist", "Editor", "Legal Assistant",
  "Director Of Technology", "Interior Designer", "Chief Operations Officer",
  "Business Development Executive", "HR Specialist", "Devops", "Community Manager",
  "Civil Engineer", "Attorney At Law", "Associate Consultant", "CEO And Co-Founder",
  "Electrician", "General Counsel", "District Sales Manager", "Director Of Product Management",
  "Assistant", "Driver", "Auditor", "Director, Marketing", "Business Consultant",
  "Assistant Vice President", "Digital Marketing Specialist", "Deputy Manager",
  "Human Resources Coordinator", "English Teacher", "Board Member", "IT Analyst",
  "Insurance Agent", "Founding Partner", "Event Manager", "Director Of Development",
  "Co-Founder & CTO", "Auxiliar Administrativo", "Database Administrator", "Admin",
  "Graduate Research Assistant", "Associate Attorney", "Chief Information Security Officer",
  "Director Of HR", "Chief Engineer", "Communications Manager", "Construction Manager",
  "Coordinator", "Director Of Communications", "Estimator", "Corporate Recruiter",
  "Business Development Director", "Enterprise Architect", "Case Manager", "Bookkeeper",
  "Chief Revenue Officer", "Analista", "Assistente Administrativo", "Bartender", "Advisor",
  "Development Manager", "Co-Founder, CEO", "Human Resources Specialist", "Broker Associate",
  "Doctor", "Assistant Director", "Consultor", "CTO/Cio", "Event Coordinator", "Chef",
  "Chief Product Officer", "Director Of Digital Marketing", "Application Developer",
  "HR Assistant", "HR Executive", "Directeur", "Executive Administrative Assistant",
  "Captain", "Licensed Realtor", "Business Development Representative", "Associate Broker",
  "Director Of Sales & Marketing", "Commercial Manager", "HR Consultant",
  "Management Trainee", "Finance", "Flight Attendant", "Lead Engineer",
  "Director Of Marketing And Communications", "Manager, Human Resources",
  "Assistant Project Manager", "Application Engineer", "Logistics Manager",
  "Assistant General Manager", "Lead Software Engineer", "Employee",
  "Founder And President", "Independent Distributor", "Director Of Recruiting",
  "CEO/Founder", "Associate Creative Director", "Assistant Store Manager", "Barista",
  "Director Of Product Marketing", "Corporate Controller", "Director Of Talent Acquisition",
  "Administrativo", "Assistant Controller", "Legal Secretary", "Author",
  "Commercial Director", "Chief People Officer", "Inside Sales Representative",
  "Devops Engineer", "Co-Founder And CTO", "Broker/Owner", "Advogado",
  "Field Engineer", "Maintenance Manager", "Clerk", "Field Service Engineer", "Cofounder",
  "Human Resources Assistant", "Executive Chef", "IT Administrator", "General Sales Manager",
  "Director, Business Development", "Franchise Owner", "Customer Service Supervisor",
  "Adjunct Faculty", "Benefits Manager", "Inside Sales", "Abogado", "Java Developer",
  "Head Of Product", "Management Consultant", "Contracts Manager", "Freelance Writer",
  "CEO/President/Owner", "Journalist", "Associate Software Engineer", "Head Of HR",
  "Internal Auditor", "Head Of Information Technology", "Founder & President", "Accounting",
  "Freelancer", "Front Office Manager", "Entrepreneur", "HR Administrator",
  "Graduate Teaching Assistant", "Director Of Sales Operations", "Diretor", "Data Engineer",
  "Librarian", "Facility Manager", "Administration", "IT Architect", "Legal Counsel",
  "Maintenance Supervisor", "Head Of Operations", "Founder / CEO", "Chief Strategy Officer",
  "Communications Director", "Development Director", "Content Marketing Manager",
  "Internship", "Counselor", "Assistant Superintendent", "Business Systems Analyst",
  "Design Director", "CEO/President", "Manager, Marketing", "Coach",
  "Freelance Graphic Designer", "Lead Developer", "Associate Manager", "Android Developer",
  "IT Department Manager", "IT Engineer", "Chiropractor", "Credit Analyst",
  "Independent Business Owner", "Adjunct Instructor", "Head Of Human Resources",
  "Brand Ambassador", "Copywriter", "Chairman & CEO", "Email Marketing Manager",
  "Frontend Developer", "Human Resource Director", "Client Services Manager",
  "IT Support Specialist", "Contract Manager", "Impiegato", "CEO, Founder",
  "Chief Medical Officer", "Banker", "Director Information Technology", "Director Of Product",
  "Director, Product Management", "Country Manager", "Financial Consultant", "Administrador",
  "Executive Assistant To CEO", "Advogada", "Field Marketing Manager",
  "Business Intelligence Analyst", "Director Marketing", "Loan Officer",
  "Freelance Photographer", "Actor", "Chef De Projet", "Foreman",
  "Information Technology Project Manager", "Graduate Assistant", "Inside Sales Manager",
  "Department Manager", "HR Officer", "Account Coordinator", "Deputy Director",
  "Director Of Facilities", "Executive Recruiter", "IT Technician", "CEO, Co-Founder",
  "Full Stack Developer", "CEO / Founder", "Counsel", "Logistics Coordinator",
  "Founder And Chief Executive Officer", "Chairman And CEO", "Administrative Coordinator",
  "Director Business Development", "Category Manager", "Data Architect",
  "Information Technology", "Head Of Sales", "Chief Information Officer (Cio)", "IT Recruiter",
  "Information Security Analyst", "Associate General Counsel", "Inspector", "Admin Assistant",
  "Dispatcher", "Contractor", "Design Manager", "Ecommerce Manager", "Chief Technical Officer",
  "Field Service Technician", "Executive Secretary", "Co-Founder, CTO",
  "Director, Talent Acquisition", "Accounting Assistant", "Director, IT", "Account Supervisor",
  "Human Resources Administrator", "Faculty", "Administrative Officer", "Front End Developer",
  "Content Manager", "Freelance", "Maintenance Technician", "Business Development Specialist",
  "Business Development Consultant", "Communications Specialist", "Director, Product Marketing",
  "Client Manager", "Compliance Officer", "Executive Producer", "Customer Service Specialist",
  "Certified Personal Trainer", "Human Resources Executive", "Chief Executive", "HR Advisor",
  "Compliance Manager", "Head Of IT", "IT Business Analyst", "Homemaker", "Events Manager",
  "Fleet Manager", "CEO & President", "Carpenter", "HR Recruiter",
  "Director, Digital Marketing", "Laboratory Technician", "Associate Product Manager",
  "Director Product Management", "Independent Contractor", "Accounts Payable",
  "Digital Marketing Director", "Instructional Designer", "Digital Project Manager",
  "Audit Manager", "Estudante", "Credit Manager", "Eigenaar", "Business Developer",
  "Head Of Business Development", "Avvocato", "Chief Administrative Officer", "Asset Manager",
  "Accounts Payable Specialist", "Chief Compliance Officer", "Empleado",
  "Digital Marketing Executive", "Account Representative", "Campaign Manager",
  "Director, Engineering", "Engagement Manager", "Management", "Delivery Manager",
  "Manager Human Resources", "Cook", "Director Of Product Development",
  "Information Technology Specialist", "Chief Of Staff", "Associate Vice President",
  "Company Director", "Chief Technology Officer (CTO)", "Digital Marketing Consultant",
  "Firefighter", "Business Operations Manager", "Crew Member", "Director - Human Resources",
  "Caregiver", "Customer Experience Manager", "Financial Accountant", "Customer Service Rep",
  "Bank Teller", "IT Operations Manager", "Management Accountant", "Digital Marketing",
  "Investigator", "Enterprise Account Executive", "Logistics", "Deputy General Manager",
  "Freelance Designer", "Economist", "Digital Marketing Coordinator", "Co-Founder & COO",
  "Chief Architect", "Learning And Development Manager", "Director General", "Distributor",
  "Associate Marketing Manager", "Abogada", "Assistant General Counsel", "Machine Operator",
  "Delivery Driver", "Comercial", "Chemist", "Hostess", "Lead Consultant",
  "Director Of Training", "Financial Representative", "Maintenance", "Audit Associate",
  "Housewife", "Assistant Accountant", "Financial Manager", "Maintenance Engineer",
  "Contract Administrator", "First Officer", "Director Of Marketing Communications",
  "Comptable", "Finance Officer", "Financial Planner", "Automation Engineer",
  "Administrativa", "Estudiante", "Accounts Manager", "Customer Service Associate",
  "Investment Banking Analyst", "Director HR",
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
  "New Zealand", "Fiji", "Papua New Guinea",
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
