/**
 * English — canonical translation file. This is the source of truth for
 * every translation KEY in the app: TranslationKey (see index.ts) is
 * derived from `keyof typeof en`, so every other language file is
 * type-checked against exactly this set of keys — add a key here first,
 * then add the same key to every file in this folder.
 */
const en = {
  // Header / navigation
  'nav.home': 'Home',
  'nav.about': 'About',
  'nav.businesses': 'Our Businesses',
  'nav.products': 'Products',
  'nav.investors': 'Investors',
  'nav.sustainability': 'Sustainability',
  'nav.careers': 'Careers',
  'nav.news': 'News & Media',
  'nav.contact': 'Contact',
  'header.tagline': 'A Spirit of Entrepreneurship for Over 150 Years',
  'header.customerLogin': 'Customer Login',
  'header.employeeLogin': 'Employee Login',

  // Search
  'search.placeholder': 'Search pages, businesses, products, news, careers…',
  'search.close': 'Press Esc to close',
  'search.noResults': 'No results found',

  // Hero slide
  'hero.slide1.eyebrow': '150+ YEARS OF TRUST',
'hero.slide1.headline': 'Building Sustainable Businesses.',
'hero.slide1.subheading':
  'A diversified group creating lasting value across Africa and beyond.',
'hero.slide1.primaryCta': 'Explore Our Businesses',
'hero.slide1.secondaryCta': 'About Kewalram Chanrai',
'hero.slide2.eyebrow': 'ENGINEERED FOR EXCELLENCE',
'hero.slide2.headline': 'Automotive Solutions You Can Trust.',
'hero.slide2.subheading':
  'Vehicle sales and full-service workshops, nationwide.',
'hero.slide2.primaryCta': 'Visit the Workshop',
'hero.slide2.secondaryCta': 'Customer Portal',
'hero.slide3.eyebrow': 'ROOTED IN AGRICULTURE',
'hero.slide3.headline': 'Growing Nigeria From the Ground Up.',
'hero.slide3.subheading':
  'Our agricultural operations strengthen food security and support sustainable supply chains by producing high-quality agricultural products that help feed, clothe, and improve the lives of communities across Nigeria and beyond.',
'hero.slide3.primaryCta': 'See Our Impact',
'hero.slide3.secondaryCta': 'Careers',

  // Stats
  'stats.years': 'Years of Legacy',
  'stats.divisions': 'Business Divisions',
  'stats.employees': 'Employees',
  'stats.countries': 'Countries of Operation',

  // About section
  'about.eyebrow': 'ABOUT KEWALRAM CHANRAI GROUP',
  'about.title': 'A Legacy of Trust. A Future of Excellence.',
  'about.body':
    'For over 150 years, Kewalram Chanrai Group has been at the forefront of innovation and entrepreneurship. From our humble beginnings to our global footprint today, our commitment to quality, integrity and sustainable growth remains unwavering.',
  'about.cta': 'Discover Our Story',
  'about.badgeYears': '150+',
  'about.badgeCaption': 'Years of Excellence, Since 1870',

  // Business units
  'business.eyebrow': 'OUR BUSINESSES',
  'business.title': 'Diverse Industries. Shared Purpose.',
  'business.viewAll': 'View All Businesses',
  'business.automotive': 'Automotive',
  'business.agriculture': 'Agriculture',
  'business.manufacturing': 'Manufacturing',
  'business.food': 'Food',
  'business.logistics': 'Logistics',
  'business.healthcare': 'Healthcare',

  // Partners
  'partners.title': 'Trusted by Leading Brands',

  // CTA section
  'cta.title': "Let's Build Something Lasting Together.",
  'cta.body': "Whether you're a customer, partner, or future employee — we'd love to hear from you.",
  'cta.contact': 'Contact Us',
  'cta.careers': 'Explore Careers',

  // News section
  'news.eyebrow': 'LATEST NEWS & HIGHLIGHTS',
  'news.title': 'What\u2019s Happening at Kewalram',
  'news.readMore': 'Read More',
  'news.sustainabilityEyebrow': 'SUSTAINABILITY',
  'news.sustainabilityTitle': 'Building a Better Tomorrow',
  'news.sustainabilityBody':
    'We are committed to sustainable practices that protect our planet and empower communities.',
  'news.sustainabilityCta': 'Learn More',

  // Footer
  'footer.quickLinks': 'Quick Links',
  'footer.ourBusinesses': 'Our Businesses',
  'footer.contactUs': 'Contact Us',
  'footer.companyName': 'Kewalram Chanrai Group',
  'footer.companyDescription':
    'A spirit of entrepreneurship that has driven the success of our businesses for over 150 years.',
  'footer.headOffice': 'Kewalram Chanrai Group Head Office',
  'footer.location': 'Lagos, Nigeria',
  'footer.newsletter': 'Newsletter',
  'footer.newsletterText': 'Stay updated with our latest news and insights.',
  'footer.newsletterPlaceholder': 'Enter your email',
  'footer.newsletterSuccess': "Thanks — you're subscribed!",
  'footer.privacy': 'Privacy Policy',
  'footer.terms': 'Terms of Use',
  'footer.rights': 'All rights reserved.',

  // Generic / shared
  'common.comingSoonDefault': 'This section is currently under development and will be activated after project approval.',
  'common.loading': 'Loading…',
} as const;

export default en;
