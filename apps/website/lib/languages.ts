/**
 * ============================================================================
 * LANGUAGE CONFIGURATION — edit this file to add or remove languages.
 * ============================================================================
 *
 * To add a language:
 *   1. Add an entry to `LANGUAGES` below (code, label, flag emoji, dir).
 *   2. Add a matching key to `TRANSLATIONS` with a value for every existing
 *      translation key (copy an existing language's block as a starting
 *      point and translate each string).
 *
 * To remove a language: delete its entry from both `LANGUAGES` and
 * `TRANSLATIONS`.
 *
 * Scope note: this translates the site's chrome (header, navigation,
 * buttons, footer) — the strings listed in TRANSLATIONS below. Long-form
 * page content (hero copy, business descriptions, news articles, etc.) is
 * not translated yet; that's a larger follow-up phase once real page
 * content exists to translate.
 * ============================================================================
 */

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳', dir: 'ltr' },
  { code: 'yo', label: 'Yorùbá', flag: '🇳🇬', dir: 'ltr' },
  { code: 'ha', label: 'Hausa', flag: '🇳🇬', dir: 'ltr' },
  { code: 'ig', label: 'Igbo', flag: '🇳🇬', dir: 'ltr' },
  { code: 'zh', label: '中文', flag: '🇨🇳', dir: 'ltr' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', dir: 'rtl' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export type TranslationKey =
  | 'nav.home'
  | 'nav.about'
  | 'nav.businesses'
  | 'nav.products'
  | 'nav.investors'
  | 'nav.sustainability'
  | 'nav.careers'
  | 'nav.news'
  | 'nav.contact'
  | 'header.tagline'
  | 'header.customerLogin'
  | 'header.employeeLogin'
  | 'search.placeholder'
  | 'search.close'
  | 'search.noResults'
  | 'footer.quickLinks'
  | 'footer.ourBusinesses'
  | 'footer.contactUs'
  | 'footer.newsletter'
  | 'footer.newsletterText'
  | 'footer.newsletterPlaceholder'
  | 'footer.newsletterSuccess'
  | 'footer.privacy'
  | 'footer.terms'
  | 'footer.rights';

type TranslationTable = Record<LanguageCode, Record<TranslationKey, string>>;

export const TRANSLATIONS: TranslationTable = {
  en: {
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
    'search.placeholder': 'Search pages, businesses, products, news, careers…',
    'search.close': 'Press Esc to close',
    'search.noResults': 'No results found',
    'footer.quickLinks': 'Quick Links',
    'footer.ourBusinesses': 'Our Businesses',
    'footer.contactUs': 'Contact Us',
    'footer.newsletter': 'Newsletter',
    'footer.newsletterText': 'Stay updated with our latest news and insights.',
    'footer.newsletterPlaceholder': 'Enter your email',
    'footer.newsletterSuccess': "Thanks — you're subscribed!",
    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms of Use',
    'footer.rights': 'All rights reserved.',
  },
  hi: {
    'nav.home': 'होम',
    'nav.about': 'हमारे बारे में',
    'nav.businesses': 'हमारे व्यवसाय',
    'nav.products': 'उत्पाद',
    'nav.investors': 'निवेशक',
    'nav.sustainability': 'सततता',
    'nav.careers': 'करियर',
    'nav.news': 'समाचार और मीडिया',
    'nav.contact': 'संपर्क करें',
    'header.tagline': '150 से अधिक वर्षों की उद्यमशीलता की भावना',
    'header.customerLogin': 'ग्राहक लॉगिन',
    'header.employeeLogin': 'कर्मचारी लॉगिन',
    'search.placeholder': 'पेज, व्यवसाय, उत्पाद, समाचार, करियर खोजें…',
    'search.close': 'बंद करने के लिए Esc दबाएं',
    'search.noResults': 'कोई परिणाम नहीं मिला',
    'footer.quickLinks': 'त्वरित लिंक',
    'footer.ourBusinesses': 'हमारे व्यवसाय',
    'footer.contactUs': 'संपर्क करें',
    'footer.newsletter': 'न्यूज़लेटर',
    'footer.newsletterText': 'हमारी नवीनतम खबरों से जुड़े रहें।',
    'footer.newsletterPlaceholder': 'अपना ईमेल दर्ज करें',
    'footer.newsletterSuccess': 'धन्यवाद — आप सदस्यता ले चुके हैं!',
    'footer.privacy': 'गोपनीयता नीति',
    'footer.terms': 'उपयोग की शर्तें',
    'footer.rights': 'सर्वाधिकार सुरक्षित।',
  },
  yo: {
    'nav.home': 'Ilé',
    'nav.about': 'Nípa Wa',
    'nav.businesses': 'Àwọn Iṣòwò Wa',
    'nav.products': 'Àwọn Ọjà',
    'nav.investors': 'Àwọn Olùdókòwò',
    'nav.sustainability': 'Ìdàgbàsókè Alálòpẹ́ẹ́',
    'nav.careers': 'Àwọn Iṣẹ́',
    'nav.news': 'Ìròyìn àti Amóhùnmáwòrán',
    'nav.contact': 'Kàn sí Wa',
    'header.tagline': 'Ẹ̀mí Iṣòwò fún Ọdún 150 àti Jù Bẹ́ẹ̀ Lọ',
    'header.customerLogin': 'Ìwọlé Onibara',
    'header.employeeLogin': 'Ìwọlé Òṣìṣẹ́',
    'search.placeholder': 'Wá àwọn ojú-ìwé, iṣòwò, ọjà, ìròyìn, iṣẹ́…',
    'search.close': 'Tẹ Esc láti ti',
    'search.noResults': 'Kò sí àbájáde',
    'footer.quickLinks': 'Àwọn Ọ̀nà Kánkán',
    'footer.ourBusinesses': 'Àwọn Iṣòwò Wa',
    'footer.contactUs': 'Kàn sí Wa',
    'footer.newsletter': 'Ìwé Ìròyìn',
    'footer.newsletterText': 'Máa gba ìròyìn àti ìmọ̀ tuntun lọ́wọ́ wa.',
    'footer.newsletterPlaceholder': 'Tẹ ímeèlì rẹ',
    'footer.newsletterSuccess': 'Ẹ ṣé — o ti forúkọ sílẹ̀!',
    'footer.privacy': 'Òfin Ìpamọ́',
    'footer.terms': 'Àwọn Òfin Lílò',
    'footer.rights': 'Gbogbo ẹ̀tọ́ ni a dá dúró.',
  },
  ha: {
    'nav.home': 'Gida',
    'nav.about': 'Game da Mu',
    'nav.businesses': 'Kasuwancinmu',
    'nav.products': 'Kayayyaki',
    'nav.investors': 'Masu Zuba Jari',
    'nav.sustainability': 'Dorewa',
    'nav.careers': 'Ayyuka',
    'nav.news': 'Labarai da Kafofin Watsa Labarai',
    'nav.contact': 'Tuntube Mu',
    'header.tagline': 'Ruhun Kasuwanci na Sama da Shekaru 150',
    'header.customerLogin': 'Shiga na Abokin Ciniki',
    'header.employeeLogin': 'Shiga na Ma\u2019aikaci',
    'search.placeholder': 'Nemo shafuka, kasuwanci, kayayyaki, labarai, ayyuka…',
    'search.close': 'Danna Esc don rufewa',
    'search.noResults': 'Ba a sami sakamako ba',
    'footer.quickLinks': 'Hanyoyin Sauri',
    'footer.ourBusinesses': 'Kasuwancinmu',
    'footer.contactUs': 'Tuntube Mu',
    'footer.newsletter': 'Wasiƙar Labarai',
    'footer.newsletterText': 'Ci gaba da sabuntawa da labaranmu na baya-bayan nan.',
    'footer.newsletterPlaceholder': 'Shigar da imel ɗinka',
    'footer.newsletterSuccess': 'Na gode — an yi rajistarka!',
    'footer.privacy': 'Manufar Sirri',
    'footer.terms': 'Sharuɗɗan Amfani',
    'footer.rights': 'Duk hakkoki an kiyaye su.',
  },
  ig: {
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
  },
  zh: {
    'nav.home': '首页',
    'nav.about': '关于我们',
    'nav.businesses': '业务板块',
    'nav.products': '产品',
    'nav.investors': '投资者',
    'nav.sustainability': '可持续发展',
    'nav.careers': '招聘',
    'nav.news': '新闻媒体',
    'nav.contact': '联系我们',
    'header.tagline': '150多年的企业家精神',
    'header.customerLogin': '客户登录',
    'header.employeeLogin': '员工登录',
    'search.placeholder': '搜索页面、业务、产品、新闻、招聘…',
    'search.close': '按 Esc 关闭',
    'search.noResults': '未找到结果',
    'footer.quickLinks': '快速链接',
    'footer.ourBusinesses': '业务板块',
    'footer.contactUs': '联系我们',
    'footer.newsletter': '订阅通讯',
    'footer.newsletterText': '获取我们的最新资讯。',
    'footer.newsletterPlaceholder': '输入您的邮箱',
    'footer.newsletterSuccess': '谢谢 — 您已订阅！',
    'footer.privacy': '隐私政策',
    'footer.terms': '使用条款',
    'footer.rights': '版权所有。',
  },
  fr: {
    'nav.home': 'Accueil',
    'nav.about': 'À propos',
    'nav.businesses': 'Nos activités',
    'nav.products': 'Produits',
    'nav.investors': 'Investisseurs',
    'nav.sustainability': 'Durabilité',
    'nav.careers': 'Carrières',
    'nav.news': 'Actualités',
    'nav.contact': 'Contact',
    'header.tagline': "Un esprit d'entreprise depuis plus de 150 ans",
    'header.customerLogin': 'Espace client',
    'header.employeeLogin': 'Espace employé',
    'search.placeholder': 'Rechercher des pages, activités, produits, actualités, carrières…',
    'search.close': 'Appuyez sur Échap pour fermer',
    'search.noResults': 'Aucun résultat trouvé',
    'footer.quickLinks': 'Liens rapides',
    'footer.ourBusinesses': 'Nos activités',
    'footer.contactUs': 'Contactez-nous',
    'footer.newsletter': 'Newsletter',
    'footer.newsletterText': 'Restez informé de nos dernières actualités.',
    'footer.newsletterPlaceholder': 'Entrez votre e-mail',
    'footer.newsletterSuccess': 'Merci — vous êtes inscrit !',
    'footer.privacy': 'Politique de confidentialité',
    'footer.terms': "Conditions d'utilisation",
    'footer.rights': 'Tous droits réservés.',
  },
  ar: {
    'nav.home': 'الرئيسية',
    'nav.about': 'من نحن',
    'nav.businesses': 'أعمالنا',
    'nav.products': 'المنتجات',
    'nav.investors': 'المستثمرون',
    'nav.sustainability': 'الاستدامة',
    'nav.careers': 'الوظائف',
    'nav.news': 'الأخبار والإعلام',
    'nav.contact': 'اتصل بنا',
    'header.tagline': 'روح ريادة الأعمال منذ أكثر من 150 عامًا',
    'header.customerLogin': 'دخول العملاء',
    'header.employeeLogin': 'دخول الموظفين',
    'search.placeholder': 'ابحث عن الصفحات والأعمال والمنتجات والأخبار والوظائف…',
    'search.close': 'اضغط Esc للإغلاق',
    'search.noResults': 'لا توجد نتائج',
    'footer.quickLinks': 'روابط سريعة',
    'footer.ourBusinesses': 'أعمالنا',
    'footer.contactUs': 'اتصل بنا',
    'footer.newsletter': 'النشرة الإخبارية',
    'footer.newsletterText': 'ابق على اطلاع بأحدث أخبارنا.',
    'footer.newsletterPlaceholder': 'أدخل بريدك الإلكتروني',
    'footer.newsletterSuccess': 'شكرًا — تم اشتراكك!',
    'footer.privacy': 'سياسة الخصوصية',
    'footer.terms': 'شروط الاستخدام',
    'footer.rights': 'جميع الحقوق محفوظة.',
  },
};
