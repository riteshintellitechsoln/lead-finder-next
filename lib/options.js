// Fixed dropdown options for the filters (lists given by the client).
// The sidebar always shows these values, in this order, with live counts.
// No database code here: used by the browser too.

export const FUNCTIONS = [
  'Accounting', 'Administrative', 'Arts and Design', 'Business Development', 'Community and Social Services',
  'Consulting', 'Customer Success and Support', 'Education', 'Engineering', 'Entrepreneurship', 'Finance',
  'Healthcare Services', 'Human Resources', 'Information Technology', 'Legal', 'Marketing', 'Media and Communication',
  'Military and Protective Services', 'Operations', 'Product Management', 'Program and Project Management', 'Purchasing',
  'Quality Assurance', 'Real Estate', 'Research', 'Sales',
];

// Highest first
export const SENIORITY_LEVELS = ['Owner / Partner', 'CXO', 'Vice President', 'Director', 'Manager', 'Staff'];

// Company headcount: bucket keys and the upper edge of each bucket (the last one is open)
export const SIZE_KEYS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'];
export const SIZE_EDGES = [10, 50, 200, 500, 1000, 5000, 10000];
export const SIZE_LABELS = {
  '1-10': '1–10',
  '11-50': '11–50',
  '51-200': '51–200',
  '201-500': '201–500',
  '501-1000': '501–1,000',
  '1001-5000': '1,001–5,000',
  '5001-10000': '5,001–10,000',
  '10001+': '10,001+',
};

export const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia',
  'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin',
  'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia',
  'Comoros', 'Congo (Republic of the Congo)', 'Costa Rica', "Côte d'Ivoire", 'Croatia', 'Cuba', 'Cyprus', 'Czechia',
  'Democratic Republic of the Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt',
  'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon',
  'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti',
  'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan',
  'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia',
  'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta',
  'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro',
  'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger',
  'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino',
  'São Tomé and Príncipe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia',
  'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan',
  'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga',
  'Trinidad and Tobago', 'Tunisia', 'Türkiye (Turkey)', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine',
  'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City (Holy See)',
  'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
];

export const INDUSTRIES = [
  'Accounting', 'Administration of Justice', 'Advertising Services', 'Airlines and Aviation', 'Ambulance Services',
  'Appliances, Electrical, and Electronics Manufacturing', 'Architecture and Planning', 'Armed Forces', 'Artists and Writers',
  'Aviation and Aerospace Component Manufacturing', 'Banking', 'Biotechnology Research', 'Blockchain Services', 'Blogs',
  'Book and Periodical Publishing', 'Broadcast Media Production and Distribution', 'Building Materials',
  'Business Consulting and Services', 'Business Content', 'Business Intelligence Platforms', 'Business Supplies & Equipment',
  'Chemical Manufacturing', 'Child Day Care Services', 'Chiropractors', 'Civic and Social Organizations', 'Civil Engineering',
  'Claims Adjusting, Actuarial Services', 'Community Services', 'Computer Hardware Manufacturing',
  'Computer Networking Products', 'Computers and Electronics Manufacturing', 'Construction', 'Dairy',
  'Dairy Product Manufacturing', 'Dance Companies', 'Data Security Software Products', 'Defense & Space',
  'Defense and Space Manufacturing', 'Design', 'Design Services', 'Desktop Computing Software Products',
  'Digital Accessibility Services', 'Education Administration Programs', 'Education Management', 'E-learning',
  'E-Learning Providers', 'Embedded Software Products', 'Emergency and Relief Services', 'Entertainment Providers',
  'Environmental Services', 'Events Services', 'Executive Offices', 'Family Planning Centers', 'Farming',
  'Financial Services', 'Fisheries', 'Food and Beverage Manufacturing', 'Food and Beverage Services',
  'Freight and Package Transportation', 'Fundraising', 'Furniture', 'Furniture and Home Furnishings Manufacturing',
  'Gambling Facilities and Casinos', 'Geothermal Electric Power Generation', 'Glass Product Manufacturing',
  'Glass, Ceramics and Concrete Manufacturing', 'Golf Courses and Country Clubs', 'Government Administration',
  'Government Relations', 'Government Relations Services', 'Graphic Design', 'Ground Passenger Transportation',
  'Health, Wellness & Fitness', 'Higher Education', 'Historical Sites', 'Home Health Care Services', 'Hospitality',
  'Hospitals', 'Hospitals and Health Care', 'Household and Institutional Furniture Manufacturing', 'Housing Programs',
  'Human Resources Services', 'Import & Export', 'Insurance', 'Internet News', 'Investment Banking',
  'Investment Management', 'IT System Custom Software Development', 'IT System Data Services',
  'IT System Installation and Disposal', 'IT System Operations and Maintenance', 'IT System Testing and Evaluation',
  'IT System Training and Support', 'Janitorial Services', 'Legal Services', 'Luxury Goods & Jewelry',
  'Machinery Manufacturing', 'Manufacturing', 'Medical and Diagnostic Laboratories', 'Medical Equipment Manufacturing',
  'Medical Practices', 'Mobile Computing Software Products', 'Motor Vehicle Manufacturing',
  'Motor Vehicle Parts Manufacturing', 'Movies, Videos, and Sound', 'Museums, Historical Sites, and Zoos',
  'Nanotechnology Research', 'Natural Gas Distribution', 'Natural Gas Extraction', 'Newspaper Publishing',
  'Nonmetallic Mineral Mining', 'Non-profit Organization Management', 'Non-profit Organizations',
  'Nonresidential Building Construction', 'Nuclear Electric Power Generation',
  'Nursing Homes and Residential Care Facilities', 'Office Furniture and Fixtures Manufacturing', 'Oil and Gas',
  'Oil Extraction', 'Oil, Gas, and Mining', 'Online Audio and Video Media', 'Online Media', 'Optometrists',
  'Outpatient Care Centers', 'Outsourcing and Offshoring Consulting', 'Outsourcing/Offshoring',
  'Paper and Forest Product Manufacturing', 'Performing Arts', 'Performing Arts and Spectator Sports',
  'Personal Care Product Manufacturing', 'Pharmaceutical Manufacturing', 'Physical, Occupational and Speech Therapists',
  'Political Organizations', 'Primary and Secondary Education', 'Printing Services', 'Professional Organizations',
  'Public Policy Offices', 'Public Safety', 'Racetracks', 'Railroad Equipment Manufacturing', 'Ranching', 'Real Estate',
  'Recreational Facilities', 'Religious Institutions', 'Renewable Energy Equipment Manufacturing', 'Research Services',
  'Restaurants', 'Retail', 'Retail Apparel and Fashion', 'Retail Groceries', 'Retail Luxury Goods and Jewelry',
  'Retail Office Equipment', 'Semiconductor Manufacturing', 'Services for the Elderly and Disabled', 'Shipbuilding',
  'Social Networking Platforms', 'Software Development', 'Space Research and Technology', 'Spectator Sports',
  'Sporting Goods Manufacturing', 'Sports Teams and Clubs', 'Strategic Management Services',
  'Technology, Information and Internet', 'Telecommunications', 'Textile Manufacturing', 'Theater Companies',
  'Tobacco Manufacturing', 'Translation and Localization', 'Transportation Equipment Manufacturing',
  'Transportation Programs', 'Travel Arrangements', 'Truck Transportation', 'Urban Transit Services', 'Utilities',
  'Utilities Administration', 'Utility System Construction', 'Vehicle Repair and Maintenance',
  'Venture Capital and Private Equity Principals', 'Veterinary', 'Veterinary Services', 'Vocational Rehabilitation Services',
  'Warehousing and Storage', 'Wellness and Fitness Services', 'Wholesale', 'Wholesale Building Materials',
  'Wholesale Computer Equipment', 'Wholesale Furniture and Home Furnishings',
  'Wholesale Hardware, Plumbing, Heating Equipment', 'Wholesale Import and Export', 'Wholesale Luxury Goods and Jewelry',
  'Wholesale Motor Vehicles and Parts', 'Wholesale Photography Equipment and Supplies', 'Wireless Services',
  'Writing and Editing', 'Zoos and Botanical Gardens',
];

// Filter key -> its fixed options
export const FIXED_OPTIONS = { department: FUNCTIONS, seniority: SENIORITY_LEVELS, industry: INDUSTRIES, country: COUNTRIES };
