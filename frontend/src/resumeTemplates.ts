// Fresher resume starter templates + visual (ATS-friendly) template styles.
// SAMPLE content is preview-only. When a template is used, sections start EMPTY and the
// sample guidance is shown only as placeholder hints — it is never saved into the resume.

export type TemplateSection = { title: string; hint: string; optional?: boolean };
export type FresherTemplate = {
  key: string;
  name: string;
  desc: string;
  style: string;
  sections: TemplateSection[];
  sample: { name: string; contact: string; sections: { title: string; content: string }[] };
};

const COMMON_TAIL: TemplateSection[] = [
  { title: "CERTIFICATIONS & ACHIEVEMENTS", hint: "- Certification name, issuing body, year\n- Award or achievement (only if true)", optional: true },
  { title: "EXTRACURRICULAR ACTIVITIES", hint: "- Club / event / volunteering — your role", optional: true },
];

export const FRESHER_TEMPLATES: FresherTemplate[] = [
  {
    key: "general",
    name: "General Fresher",
    desc: "Works for any entry-level role — HR, operations, sales, BPO, travel.",
    style: "classic",
    sections: [
      { title: "CAREER OBJECTIVE", hint: "e.g. Motivated commerce graduate seeking an entry-level HR role where I can apply my communication and organisation skills." },
      { title: "EDUCATION", hint: "Degree | College / University | Year | CGPA or %\nClass XII | Board | Year | %" },
      { title: "SKILLS", hint: "- Communication\n- MS Excel / MS Office\n- Languages you speak" },
      { title: "INTERNSHIPS & PROJECTS", hint: "Intern | Company | Month YYYY – Month YYYY\n- What you did and the result", optional: true },
      ...COMMON_TAIL,
    ],
    sample: {
      name: "[Your Name]",
      contact: "[email] | [phone] | [city]",
      sections: [
        { title: "CAREER OBJECTIVE", content: "Commerce graduate seeking an entry-level Human Resources role to apply strong communication and coordination skills." },
        { title: "EDUCATION", content: "B.Com | [University] | 2025 | 7.8 CGPA" },
        { title: "SKILLS", content: "• Communication  • MS Excel  • Scheduling  • English, Hindi" },
        { title: "INTERNSHIPS & PROJECTS", content: "HR Intern | [Company] | Jun 2024 – Aug 2024\n• Coordinated 40+ candidate interviews" },
      ],
    },
  },
  {
    key: "it",
    name: "IT / Technical Fresher",
    desc: "For B.Tech, BCA, MCA and other tech graduates — projects and skills first.",
    style: "modern",
    sections: [
      { title: "PROFESSIONAL SUMMARY", hint: "e.g. Computer Science graduate with hands-on project experience in Python and web development, seeking a software engineer role." },
      { title: "TECHNICAL SKILLS", hint: "Languages: Python, Java\nFrameworks: React, Django\nTools: Git, MySQL" },
      { title: "PROJECTS", hint: "Project name | Tech used | Month YYYY\n- What it does and your contribution\n- Result (users, accuracy, speed) if real" },
      { title: "EDUCATION", hint: "B.Tech Computer Science | College | Year | CGPA" },
      { title: "INTERNSHIPS", hint: "Software Intern | Company | Month YYYY – Month YYYY\n- Work done", optional: true },
      { title: "RELEVANT COURSEWORK", hint: "Data Structures, DBMS, Operating Systems, Computer Networks", optional: true },
      ...COMMON_TAIL,
    ],
    sample: {
      name: "[Your Name]",
      contact: "[email] | [phone] | [city] | [github/linkedin]",
      sections: [
        { title: "PROFESSIONAL SUMMARY", content: "Computer Science graduate with project experience in Python and React, seeking a junior developer role." },
        { title: "TECHNICAL SKILLS", content: "Languages: Python, JavaScript | Frameworks: React, Flask | Tools: Git, MySQL" },
        { title: "PROJECTS", content: "Expense Tracker | React, Flask | Mar 2025\n• Built a web app to track monthly expenses" },
        { title: "EDUCATION", content: "B.Tech Computer Science | [College] | 2025 | 8.1 CGPA" },
      ],
    },
  },
  {
    key: "finance",
    name: "Finance / Accounts Fresher",
    desc: "For B.Com, BBA, M.Com, CA/CMA aspirants — accounting skills & tools.",
    style: "compact",
    sections: [
      { title: "CAREER OBJECTIVE", hint: "e.g. B.Com graduate with a strong grounding in accounting and Tally, seeking an Accounts Executive role." },
      { title: "EDUCATION", hint: "B.Com | University | Year | %\nCA Inter / CMA (if applicable) | Attempt / Year" },
      { title: "SKILLS", hint: "- Tally ERP / Tally Prime\n- GST & TDS basics\n- MS Excel (VLOOKUP, Pivot Tables)" },
      { title: "ARTICLESHIP / INTERNSHIPS", hint: "Accounts Intern | Firm | Month YYYY – Month YYYY\n- Bookkeeping, reconciliations, GST filing support", optional: true },
      { title: "ACADEMIC PROJECTS", hint: "Project title | Month YYYY\n- What you analysed and found", optional: true },
      ...COMMON_TAIL,
    ],
    sample: {
      name: "[Your Name]",
      contact: "[email] | [phone] | [city]",
      sections: [
        { title: "CAREER OBJECTIVE", content: "B.Com graduate skilled in Tally and Excel, seeking an Accounts Executive role." },
        { title: "EDUCATION", content: "B.Com | [University] | 2025 | 78%" },
        { title: "SKILLS", content: "• Tally Prime  • GST basics  • MS Excel  • Bank reconciliation" },
        { title: "ARTICLESHIP / INTERNSHIPS", content: "Accounts Intern | [CA Firm] | Jan 2025 – Apr 2025\n• Prepared 50+ vouchers and ledgers" },
      ],
    },
  },
];

export const EXPERIENCED_BLANK: TemplateSection[] = [
  { title: "PROFESSIONAL SUMMARY", hint: "Years of experience, domain, key strengths" },
  { title: "SKILLS", hint: "- Skill / tool\n- Skill / tool" },
  { title: "WORK EXPERIENCE", hint: "Job Title | Company | Mon YYYY – Present\n- Responsibility or measurable achievement" },
  { title: "EDUCATION", hint: "Degree | Institution | Year" },
  { title: "CERTIFICATIONS", hint: "- Certification | Issuer | Year", optional: true },
];

export const STYLES = [
  { key: "classic", name: "Classic" },
  { key: "modern", name: "Modern" },
  { key: "compact", name: "Compact" },
];

export const NEW_ROLE_BLOCK = "Job Title | Company | Mon YYYY – Mon YYYY\n- ";
