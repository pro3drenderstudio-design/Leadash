export interface DiscoverCompany {
  id:          string;
  name:        string;
  domain:      string | null;
  industry:    string | null;
  size_range:  string | null;
  country:     string | null;
  state:       string | null;
  city:        string | null;
  linkedin_url:string | null;
  website:     string | null;
}

export interface DiscoverPerson {
  id:           string;
  company_id:   string | null;
  first_name:   string | null;
  last_name:    string | null;
  title:        string | null;
  seniority:    string | null;
  department:   string | null;
  linkedin_url: string | null;
  email:        string | null;
  email_status: "verified" | "unverified" | "invalid" | "risky";
  phone:        string | null;
  country:      string | null;
  state:        string | null;
  city:         string | null;
  // Joined from discover_companies
  company_name:    string | null;
  company_domain:  string | null;
  company_industry:string | null;
  company_size:    string | null;
}

// What the search API returns — emails masked until exported
export interface DiscoverResult extends Omit<DiscoverPerson, "email" | "phone"> {
  email_preview: string | null;  // e.g. "j***@acme.com"
  has_email:     boolean;
  has_phone:     boolean;
}

export interface DiscoverSearchParams {
  q?:           string;   // keyword (name, title, company)
  country?:     string;
  seniority?:   string;
  industry?:    string;
  company_size?:string;
  has_email?:   boolean;
  page?:        number;
  limit?:       number;
}

export interface DiscoverSearchResponse {
  results:          DiscoverResult[];
  total:            number;
  page:             number;
  limit:            number;
  credits_per_lead: number;
}

export interface DiscoverExportRequest {
  ids:              string[];
  format:           "csv" | "campaign";
  campaign_name?:   string;
}

export const DISCOVER_SENIORITY_OPTIONS = [
  "C-Suite", "VP", "Director", "Manager", "Senior", "Owner", "Partner", "Entry", "Intern",
] as const;

export const DISCOVER_COMPANY_SIZE_OPTIONS = [
  "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+",
] as const;
