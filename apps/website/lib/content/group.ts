/**
 * The group's own story and facts, from its public record (its milestones
 * and contact pages, and the national press). Page content, not
 * configuration: the communications team changes it here or, for news, in
 * the staff portal. Nothing here is a claim the record does not support.
 */
export const MILESTONES: { year: string; title: string; text: string }[] = [
  { year: '1860', title: 'A trading house in Sindh', text: 'Brothers Jhamatmal and Thakurdas Chanrai begin trading textiles in Sindh, then part of India.' },
  { year: '1870s', title: 'Across the Indian Ocean and the Mediterranean', text: 'Branches in Karachi and Bombay, then Malta, Gibraltar, the Canary Islands and Morocco.' },
  { year: '1900', title: 'West Africa', text: 'Operations open in Sierra Leone, Ghana and Nigeria — the beginning of more than a century in Lagos.' },
  { year: '1934', title: 'Made for West Africa', text: 'The Madras branch pioneers the export of the “Madras checkered” handkerchief to West African markets.' },
  { year: '1948', title: 'The Kewalram Chanrai Group', text: 'After Partition the family settles in Bombay; Kewalram Ghanshamdas Chanrai and his sons form the group that carries his name.' },
  { year: '1960s', title: 'A century, and a factory', text: 'The group marks a hundred years and founds Afprint, a textile plant in Lagos — the industrial estate the group still works from.' },
  { year: '1970s', title: 'From the farm', text: 'Afcott is set up to grow and gin cotton in Nigeria; Afprint later lists on the Lagos Stock Exchange.' },
  { year: '1989', title: 'Olam', text: 'Olam is established in Nigeria to develop non-oil exports; it later moves to Singapore and lists there in 2005.' },
  { year: '1993', title: 'Professionally led', text: 'The group moves from family to professional management, a principle it keeps today.' },
  { year: '2003', title: 'Springfield Agro', text: 'Farm solutions for Nigerian growers: seeds, crop protection, fertiliser and tractors.' },
  { year: '2010', title: '150 years', text: 'The group’s 150th anniversary. In 2013 it receives the inaugural EY–Barclays Family Business Award of Excellence.' },
  { year: '2016', title: 'Assembled in Nigeria', text: 'The Automobiles Manufacturing Hub opens in Isolo, Lagos, with Nigeria’s first locally assembled Foton truck. A joint venture with CFAO brings Mitsubishi.' },
  { year: '2026', title: 'Passenger cars, and grain', text: 'SOUEAST SUVs launch in Nigeria and local assembly begins; Afcott Grains opens a multi-grain processing plant in Kano.' },
];

export type Business = {
  slug: string; name: string; short: string; summary: string; image: string;
  companies: string[]; offers: string[]; places: string[]; brands?: string[];
};

export const BUSINESSES: Business[] = [
  {
    slug: 'automotive', name: 'Automotive', short: 'Vehicles, assembly, workshops, tyres and parts',
    summary: 'Nigeria’s vehicles, from the assembly line to the workshop bay: trucks, pickups, minibuses and SUVs assembled in Lagos, sold through the group’s showrooms and kept on the road by its own technicians, tyres and parts.',
    image: '/images/business/automotive.jpg',
    companies: ['Kewalram Nigeria Ltd', 'Koncept Autocentre (Isuzu)', 'Asahi Brands Ltd (Bridgestone, Firestone)', 'Massilia Motors Ltd (Mitsubishi, with CFAO)'],
    offers: ['Vehicle sales — trucks, pickups, buses and SUVs', 'Local assembly and pre-delivery inspection at the Lagos hub', 'Service workshops: maintenance, repairs, body and paint', 'Tyres, batteries, lubricants and genuine parts', 'Fleet programmes for businesses'],
    places: ['Automobiles Manufacturing Hub, Afprint Industrial Estate, Isolo, Lagos', 'Showrooms and workshops in Lagos'],
    brands: ['SOUEAST', 'Isuzu', 'Foton', 'Mitsubishi', 'Jeep', 'Dodge', 'Fiat', 'Chery', 'Bridgestone', 'Firestone', 'Bosch'],
  },
  {
    slug: 'agriculture', name: 'Agriculture', short: 'Seeds, inputs, cotton, oilseeds and grain processing',
    summary: 'Fifty years in Nigerian farming, from inputs for smallholders to processing at scale: cotton ginning in Yola, oil and feed mills in Zaria, farm solutions nationwide and, since 2026, a multi-grain plant in Kano.',
    image: '/images/business/agriculture.jpg',
    companies: ['Afcott Nigeria Ltd', 'Afcott Grains Ltd', 'Springfield Agro Ltd', 'Sunseed Nigeria Ltd'],
    offers: ['Seeds, crop protection, fertiliser and tractors for growers', 'Cotton growing and ginning', 'Edible-oil and poultry-feed milling', 'Sesame and multi-grain processing to export grade'],
    places: ['Yola and Ngurore, Adamawa', 'Zaria, Kaduna', 'Kano', 'Lagos'],
  },
  {
    slug: 'manufacturing', name: 'Manufacturing', short: 'Vehicle assembly and industrial estates',
    summary: 'The group has made things in Nigeria since the Afprint textile mill of the 1960s. Today its Automobiles Manufacturing Hub in Isolo assembles trucks, pickups, minibuses and passenger SUVs, with capacity designed for about 200,000 units a year.',
    image: '/images/business/manufacturing.jpg',
    companies: ['Afprint Nigeria Ltd', 'Kewalram Nigeria Ltd'],
    offers: ['Vehicle assembly: trucks, pickups and minibuses, passenger SUVs, two- and three-wheelers', 'Pre-delivery inspection and quality control', 'Industrial estate and warehousing at Isolo'],
    places: ['Afprint Industrial Estate, 122–132 Oshodi–Apapa Expressway, Isolo, Lagos'],
  },
  {
    slug: 'food', name: 'Food', short: 'Sunola oils, grains and everyday staples',
    summary: 'Sunola — cooking oil, grains and staples for Nigerian kitchens — made and packed by the group’s food business and sold through distributors across the country.',
    image: '/images/business/food.jpg',
    companies: ['Sunola Foods Ltd', 'Sunseed Nigeria Ltd'],
    offers: ['Edible oils and cooking essentials', 'Grains and staples', 'Distribution to wholesalers and retailers nationwide'],
    places: ['Lagos', 'Zaria'],
  },
  {
    slug: 'logistics', name: 'Logistics', short: 'Moving vehicles, parts and produce',
    summary: 'The movement behind the businesses: vehicles from the hub to the showroom, parts to the workshops, inputs to the farms and grain to the ports — run by the group for the group, and for partners who need the same reliability.',
    image: '/images/business/logistics.jpg',
    companies: ['Chanrai Nigeria Ltd', 'Kewalram Nigeria Ltd'],
    offers: ['Vehicle and parts distribution', 'Agricultural haulage and warehousing', 'Import clearing and port operations'],
    places: ['Lagos', 'Northern Nigeria'],
  },
  {
    slug: 'healthcare', name: 'Healthcare', short: 'Pharmaceutical distribution',
    summary: 'Chanrai Healthcare brings medicines and healthcare products from international manufacturers to Nigerian hospitals, pharmacies and clinics, with the cold chain and record-keeping the products require.',
    image: '/images/business/healthcare.jpg',
    companies: ['Chanrai Healthcare Ltd'],
    offers: ['Pharmaceutical import and distribution', 'Hospital and pharmacy supply', 'Regulatory compliance and cold-chain handling'],
    places: ['Lagos'],
  },
];

export const COMPANIES: { name: string; does: string; phone?: string; email?: string; where?: string; business: string }[] = [
  { name: 'Kewalram Nigeria Ltd', does: 'Vehicles: Foton, JMC, SOUEAST; assembly', phone: '+234 701 998 0505', email: 'cust.support@kewalramnigeria.com', where: 'Victoria Island and Isolo, Lagos', business: 'automotive' },
  { name: 'Chanrai Nigeria Ltd', does: 'Group services and distribution', phone: '+234 701 998 0503', email: 'customer-service@chanrainigeria.com', where: '8A Karimu Kotun Street, Victoria Island, Lagos', business: 'logistics' },
  { name: 'Koncept Autocentre', does: 'Isuzu — sales, service and parts', phone: '+234 701 655 5555', email: 'isuzu@konceptautos.com', where: 'Isolo, Lagos', business: 'automotive' },
  { name: 'Asahi Brands Ltd', does: 'Bridgestone and Firestone tyres', phone: '+234 701 797 7777', email: 'info@asahibrands.com', where: 'Isolo, Lagos', business: 'automotive' },
  { name: 'Springfield Agro Ltd', does: 'Seeds, crop protection, fertiliser, tractors', phone: '+234 701 299 9999', where: 'Lagos and the farming states', business: 'agriculture' },
  { name: 'Sunola Foods Ltd', does: 'Sunola oils and staples', phone: '+234 701 998 0700', where: 'Lagos', business: 'food' },
  { name: 'Sunseed Nigeria Ltd', does: 'Oil and poultry-feed mills', where: 'Zaria, Kaduna', business: 'agriculture' },
  { name: 'Afcott Nigeria Ltd', does: 'Cotton growing and ginning', where: 'Yola, Adamawa', business: 'agriculture' },
  { name: 'Afcott Grains Ltd', does: 'Sesame and multi-grain processing', where: 'Kano', business: 'agriculture' },
  { name: 'Chanrai Healthcare Ltd', does: 'Pharmaceutical distribution', phone: '+234 701 998 0303', where: 'Lagos', business: 'healthcare' },
  { name: 'Afprint Nigeria Ltd', does: 'Industrial estate, Isolo', where: 'Oshodi–Apapa Expressway, Isolo, Lagos', business: 'manufacturing' },
];

export const HEAD_OFFICE = { name: 'Head office, Lagos', address: '8A Karimu Kotun Street, Victoria Island, Lagos', box: 'P.O. Box 72000, Lagos' };
export const PLANT = { name: 'Automobiles Manufacturing Hub', address: 'Afprint Industrial Estate, 122–132 Oshodi–Apapa Expressway, Isolo, Lagos' };
export const GROUP_OFFICE = { name: 'Group corporate office', address: '65 Chulia Street, #49-01 OCBC Centre, Singapore 049513' };
export const COUNTRIES = ['Nigeria', 'Ghana', 'Côte d’Ivoire', 'Cameroon', 'Kenya', 'Tanzania', 'Malawi', 'India', 'Indonesia', 'Singapore', 'United Arab Emirates', 'United Kingdom'];

export const FIGURES = [
  { value: '1860', label: 'Founded', note: 'A textile trading house in Sindh' },
  { value: '1900', label: 'In Nigeria since', note: 'More than 125 years in Lagos' },
  { value: '4,600+', label: 'People', note: 'Across the group’s businesses' },
  { value: '12', label: 'Countries', note: 'Africa, Asia, the Gulf and Europe' },
];

export const PILLARS = [
  { title: 'Attractive markets', text: 'We build where demand is real and lasting: vehicles, food, farming and health in a country of more than 200 million people.' },
  { title: 'A dynamic portfolio', text: 'Businesses are started, grown, partnered and — when the time is right — handed on. Olam, Redington and Afprint all began inside the group.' },
  { title: 'Entrepreneurial teams', text: 'Family owned and professionally led since 1993: managers run their businesses with the freedom and the accountability of owners.' },
  { title: 'Sustainable growth', text: 'Value that lasts for customers, employees, partners and the communities we work in — the measure of every decision.' },
];
