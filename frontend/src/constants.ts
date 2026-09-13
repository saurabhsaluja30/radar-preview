export const CATEGORIES = [
  "HR & Recruitment",
  "Finance & Accounting",
  "Operations & Customer Experience",
  "Travel & Hospitality",
  "Sales & Business Development",
  "IT & Technology",
  "Other Professional Roles",
];

export const WORK_MODES = ["Work From Office", "Hybrid", "Remote"];

export const EXPERIENCE_RANGES = ["0-2 years", "2-5 years", "5-8 years", "8+ years"];

export const JOB_STATUSES = ["Draft", "Published", "Unpublished", "Expired"];

// Maps a membership status to a semantic theme color key + label + description.
export const MEMBERSHIP_UI: Record<
  string,
  { label: string; color: "success" | "warning" | "error" | "info"; hint: string }
> = {
  active: { label: "Active", color: "success", hint: "You have full access to all curated jobs." },
  expiring_soon: { label: "Expiring Soon", color: "warning", hint: "Renew now to keep uninterrupted access." },
  expired: { label: "Expired", color: "error", hint: "Renew to unlock premium job details again." },
  cancelled: { label: "Cancelled", color: "error", hint: "Your membership was cancelled." },
  payment_failed: { label: "Payment Failed", color: "error", hint: "Your last payment could not be completed." },
  pending: { label: "Pending Payment", color: "warning", hint: "Complete your payment to activate." },
  no_membership: { label: "No Membership", color: "info", hint: "Become a member to unlock full job details." },
};

export const CATEGORY_ICONS: Record<string, string> = {
  "HR & Recruitment": "UsersThree",
  "Finance & Accounting": "ChartLineUp",
  "Operations & Customer Experience": "Gear",
  "Travel & Hospitality": "AirplaneTilt",
  "Sales & Business Development": "Handshake",
  "IT & Technology": "Code",
  "Other Professional Roles": "Briefcase",
};
