import type en from './en';

const ig: Record<keyof typeof en, string> = {
  'nav.home': 'Ụlọ',
  'nav.about': 'Maka Anyị',
  'nav.businesses': 'Azụmahịa Anyị',
  'nav.products': 'Ngwaahịa',
  'nav.investors': 'Ndị Na-etinye Ego',
  'nav.sustainability': 'Ịdị Adịgide',
  'nav.careers': 'Ọrụ',
  'nav.news': 'Akụkọ na Mgbasa Ozi',
  'nav.contact': 'Kpọtụrụ Anyị',
  'header.tagline': 'Mmụọ Ịzụ Ahịa kemgbe Afọ 150',
  'header.customerLogin': 'Nbanye Ahịa',
  'header.employeeLogin': 'Nbanye Ọrụ',

  'search.placeholder': 'Chọọ ibe, azụmahịa, ngwaahịa, akụkọ, ọrụ…',
  'search.close': 'Pịa Esc iji mechie',
  'search.noResults': 'Enweghị nsonaazụ',

  'hero.slide1.eyebrow': 'AFỌ 150+ NKE NTỤKWASỊOBI',
'hero.slide1.headline': 'Iwulite Azụmahịa Na-adịgide Adịgide.',
'hero.slide1.subheading':
  'Otu dị iche iche na-emepụta uru na-adịgide na Africa na mgbe niile ọzọ.',
'hero.slide1.primaryCta': 'Chọpụta Azụmahịa Anyị',
'hero.slide1.secondaryCta': 'Maka Kewalram Chanrai',
'hero.slide2.eyebrow': 'EDEZIRI MAKA ỊMA MMA',
'hero.slide2.headline': 'Ngwọta Ụgbọala A Na-atụkwasị Obi.',
'hero.slide2.subheading':
  'Ire ụgbọala na ụlọ ọrụ ọrụ zuru oke n’akụkụ niile nke mba ahụ.',
'hero.slide2.primaryCta': 'Gaa Ụlọ Ọrụ',
'hero.slide2.secondaryCta': 'Ọnọdụ Ahịa',
'hero.slide3.eyebrow': 'AKỤRỤNGWA ANYỊ DỊ NA ỌRỤ UGBO',
'hero.slide3.headline': 'Na-ewulite Ọdịnihu Naịjirịa Site na Mgbọrọgwụ Ya.',
'hero.slide3.subheading':
  'Ọrụ ugbo anyị na-eme ka nchekwa nri sie ike ma na-akwado usoro nkwakọba na nkesa na-adịgide adịgide site n’ịmepụta ngwaahịa ugbo dị elu nke na-enyere aka inye nri, uwe, ma melite ndụ obodo dị iche iche n’ofe Naịjirịa na ọbụna karịa.',
'hero.slide3.primaryCta': 'Lee Mmetụta Anyị',
'hero.slide3.secondaryCta': 'Ọrụ',

  'stats.years': 'Afọ Ndụmọdụ',
  'stats.divisions': 'Ngalaba Azụmahịa',
  'stats.employees': 'Ndị Ọrụ',
  'stats.countries': 'Mba Ọrụ',

  'about.eyebrow': 'MAKA KEWALRAM CHANRAI GROUP',
  'about.title': 'Ihe Nketa Ntụkwasị Obi. Ọdịnihu Ịma Mma.',
  'about.body':
    'Ihe karịrị afọ 150, Kewalram Chanrai Group anọwo n\u2019ihu n\u2019ihe ọhụrụ na ime azụmahịa. Site na mmalite anyị dị nta ruo na ọsọ ọsọ zuru ụwa ọnụ taa, nrara anyị nye ogo, izi ezi na uto na-adịgide adịgide adịbeghị mgbe ọ dara ada.',
  'about.cta': 'Chọpụta Akụkọ Anyị',
  'about.badgeYears': '150+',
  'about.badgeCaption': 'Afọ Ịma Mma, Kemgbe 1870',

  'business.eyebrow': 'AZỤMAHỊA ANYỊ',
  'business.title': 'Ụdị Azụmahịa Dị Iche Iche. Ebumnobi Otu.',
  'business.viewAll': 'Lee Azụmahịa Niile',
  'business.automotive': 'Ụgbọala',
  'business.agriculture': 'Ọrụ Ugbo',
  'business.manufacturing': 'Nrụpụta',
  'business.food': 'Nri',
  'business.logistics': 'Mbupu',
  'business.healthcare': 'Ahụike',

  'partners.title': 'Ndị Ọkacha Mara Na-atụkwasị Obi',

  'cta.title': "Ka Anyị Wulite Ihe Na-adịgide Ọnụ.",
  'cta.body': 'Ma ị bụ ahịa, onye mmekọ, ma ọ bụ onye ọrụ n\u2019ọdịnihu — anyị ga-amasị ịnụ olu gị.',
  'cta.contact': 'Kpọtụrụ Anyị',
  'cta.careers': 'Chọpụta Ọrụ',

  'news.eyebrow': 'AKỤKỌ ỌHỤRỤ NA IHE PỤTARA IHE',
  'news.title': 'Ihe Na-eme Na Kewalram',
  'news.readMore': 'Gụkwuo Ihe Ọzọ',
  'news.sustainabilityEyebrow': 'ỊDỊ ADỊGIDE',
  'news.sustainabilityTitle': 'Iwulite Echi Ka Mma',
  'news.sustainabilityBody': 'Anyị na-arụsi ọrụ ike n\u2019omume na-adịgide adịgide nke na-echebe ụwa anyị ma na-eme ka obodo dị ike.',
  'news.sustainabilityCta': 'Mụtakwuo',

  'footer.quickLinks': 'Njikọ Ngwa Ngwa',
  'footer.ourBusinesses': 'Azụmahịa Anyị',
  'footer.contactUs': 'Kpọtụrụ Anyị',
  'footer.newsletter': 'Akwụkwọ Akụkọ',
  'footer.newsletterText': 'Nweta akụkọ na nghọta ọhụrụ anyị.',
  'footer.newsletterPlaceholder': 'Tinye email gị',
  'footer.newsletterSuccess': 'Daalụ — edebanyela gị aha!',
  'footer.privacy': 'Amụma Nzuzo',
  'footer.terms': 'Usoro Iji',
  'footer.rights': 'Ikike niile echekwabara.',

  'common.comingSoonDefault': 'Ngalaba a ka na-arụsi ọrụ ma a ga-emepe ya mgbe akwadoro ọrụ ahụ.',
  'common.loading': 'Na-ebu…',
};

export default ig;
