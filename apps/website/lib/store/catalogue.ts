import type { ArtKind } from '@/components/store/VehicleArt';

/**
 * The store's catalogue, for demonstration: the models the group sells in
 * Nigeria, with indicative naira prices and a launch discount. Prices are
 * marked as indicative on every card; the sales team confirms each one.
 * Figures come from the public record where it exists (dealer listings, the UAE
 * price list for SOUEAST, Isuzu East Africa's list) and are rounded; every
 * card says so. Models are the ones the group and its dealers list in Nigeria.
 */
export type Category = 'suvs' | 'pickups' | 'trucks' | 'buses' | 'tyres' | 'parts';
export type Product = {
  id: string; category: Category; kind: string; brand: string; name: string; blurb: string; about: string;
  highlights: string[]; specs: [string, string][]; price: number; listPrice: number; offerLabel?: string; offerUntil?: string; priceNote: string; badge?: string; art: ArtKind;
};

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'suvs', label: 'SUVs' }, { key: 'pickups', label: 'Pickups' }, { key: 'trucks', label: 'Trucks' }, { key: 'buses', label: 'Buses and vans' }, { key: 'tyres', label: 'Tyres' }, { key: 'parts', label: 'Parts' },
];

export const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
export const discountPct = (p: Product) => (p.listPrice > p.price ? Math.round(((p.listPrice - p.price) / p.listPrice) * 100) : 0);

export const PRODUCTS: Product[] = [
  // ── SUVs: SOUEAST (launched April 2026; S06 and S07 assembled in Lagos) ──
  { id: 'soueast-s05', category: 'suvs', kind: 'Compact SUV', brand: 'SOUEAST', name: 'SOUEAST S05', art: 'suv', badge: 'New in Nigeria',
    blurb: 'The way into the range: a compact SUV with a 1.5-litre turbo engine, a big screen and the five-year, 100,000 km warranty.',
    about: 'The S05 is SOUEAST’s compact SUV for the city and the expressway: high ground clearance, a tight turning circle, a turbocharged 1.5-litre petrol engine and a cabin built around a wide touch screen. It carries the same five-year or 100,000 km warranty as the rest of the range, serviced at the group’s own workshops in Lagos.',
    highlights: ['1.5-litre turbo petrol, automatic', 'Five-year or 100,000 km warranty', 'Large touch screen with phone mirroring', 'Reversing camera and parking sensors', 'Serviced by the group’s own workshops'],
    specs: [['Engine', '1.5 T petrol, about 145 hp'], ['Drive', 'Front-wheel drive, automatic'], ['Seats', '5'], ['Warranty', '5 years / 100,000 km'], ['Assembled', 'Imported']],
    price: 29_900_000, listPrice: 31_500_000, offerLabel: 'Launch price', offerUntil: '31 December 2026', priceNote: 'Indicative price including VAT, Lagos delivery; registration extra. Confirmed by the sales team when you reserve.' },
  { id: 'soueast-s06', category: 'suvs', kind: 'Mid-size SUV', brand: 'SOUEAST', name: 'SOUEAST S06', art: 'suv', badge: 'Assembled in Lagos',
    blurb: 'Assembled at the group’s Isolo hub: a 197 hp 1.6-litre turbo, sunroof, ventilated seats and blind-spot warning.',
    about: 'The S06 is the first SOUEAST assembled in Nigeria, at the group’s Automobiles Manufacturing Hub in Isolo. A 1.6-litre turbo engine with 197 hp, a 15.6-inch screen, ventilated front seats, a sunroof and blind-spot detection — specified for Nigerian heat, dust and roads, and delivered without weeks at sea.',
    highlights: ['Assembled in Lagos — faster delivery, local parts', '1.6 T petrol, 197 hp', 'Sunroof, ventilated seats, premium audio', 'Blind-spot detection, 360° camera', 'Five-year or 100,000 km warranty'],
    specs: [['Engine', '1.6 T petrol, 197 hp'], ['Drive', 'Front-wheel drive, automatic'], ['Seats', '5'], ['Screen', '15.6 inch'], ['Warranty', '5 years / 100,000 km'], ['Assembled', 'Isolo, Lagos']],
    price: 39_900_000, listPrice: 42_500_000, offerLabel: 'Launch price', offerUntil: '31 December 2026', priceNote: 'Indicative price including VAT, Lagos delivery; registration extra. First two services free on launch orders.' },
  { id: 'soueast-s07', category: 'suvs', kind: 'Seven-seat SUV', brand: 'SOUEAST', name: 'SOUEAST S07', art: 'suv', badge: 'Assembled in Lagos',
    blurb: 'Seven seats, a panoramic roof, Level-2 driver assistance and a 540° camera — the family and fleet SUV, built in Isolo.',
    about: 'The S07 adds a third row to the S06’s platform: five plus two seats, a panoramic roof, Level-2 driver assistance (adaptive cruise, lane keeping), a 540° camera that shows the ground under the car, and all-wheel drive on the top version. Assembled in Lagos alongside the S06.',
    highlights: ['Seven seats (5 + 2)', 'Level-2 driver assistance', '540° camera, panoramic roof', 'All-wheel drive on the top version', 'Assembled in Lagos; five-year warranty'],
    specs: [['Engine', '1.6 T petrol, 197 hp, 290 Nm'], ['Drive', 'FWD or AWD, automatic'], ['Seats', '7'], ['Screen', '12.3 inch'], ['Warranty', '5 years / 100,000 km'], ['Assembled', 'Isolo, Lagos']],
    price: 45_900_000, listPrice: 48_900_000, offerLabel: 'Launch price', offerUntil: '31 December 2026', priceNote: 'Indicative price for the front-wheel-drive version, including VAT and Lagos delivery; AWD on request.' },
  { id: 'soueast-s09', category: 'suvs', kind: 'Flagship SUV', brand: 'SOUEAST', name: 'SOUEAST S09', art: 'suv', badge: 'Flagship',
    blurb: 'The flagship: 2.0-litre turbo with 250 hp, seven seats, full driver assistance and 20-inch wheels.',
    about: 'The S09 is the top of the range — a 2.0-litre turbo engine with 250 hp, seven seats, the full driver-assistance suite, a 15.6-inch screen, premium audio and 20-inch wheels. For directors, family convoys and anyone who wants the biggest cabin in the line-up.',
    highlights: ['2.0 T petrol, 250 hp', 'Seven seats, flagship cabin', 'Full driver-assistance suite', '20-inch wheels', 'Five-year or 100,000 km warranty'],
    specs: [['Engine', '2.0 T petrol, 250 hp'], ['Drive', 'FWD or AWD, automatic'], ['Seats', '7'], ['Screen', '15.6 inch'], ['Warranty', '5 years / 100,000 km'], ['Assembled', 'Imported']],
    price: 62_500_000, listPrice: 66_000_000, offerLabel: 'Launch price', offerUntil: '31 December 2026', priceNote: 'Indicative price including VAT and Lagos delivery; registration extra.' },
  { id: 'isuzu-mu-x', category: 'suvs', kind: 'Seven-seat 4×4 SUV', brand: 'Isuzu', name: 'Isuzu mu-X', art: 'suv',
    blurb: 'A body-on-frame seven-seater with a 3.0-litre turbo-diesel and three tonnes of towing — the Isuzu for long roads.',
    about: 'Built on the D-Max’s ladder frame, the mu-X is the seven-seat SUV for rough roads and long distances: a 3.0-litre turbo-diesel, selectable four-wheel drive, three tonnes of towing and the diesel economy fleets choose Isuzu for. Sold and serviced by Koncept Autocentre.',
    highlights: ['3.0-litre turbo-diesel (4JJ3)', 'Seven seats, ladder frame', '4×4 with low range', 'Three-tonne towing', 'Isuzu service at Koncept Autocentre'],
    specs: [['Engine', '3.0 TD, about 190 PS'], ['Drive', '4×2 or 4×4, automatic'], ['Seats', '7'], ['Towing', '3,000 kg'], ['Dealer', 'Koncept Autocentre']],
    price: 84_000_000, listPrice: 88_000_000, offerLabel: 'Season offer', offerUntil: '30 November 2026', priceNote: 'Indicative price, 4×4 automatic, including VAT and Lagos delivery.' },

  // ── Pickups ──
  { id: 'isuzu-dmax-dc', category: 'pickups', kind: 'Double-cab 4×4 pickup', brand: 'Isuzu', name: 'Isuzu D-Max double cab', art: 'pickup', badge: 'Fleet favourite',
    blurb: 'The pickup Nigerian fleets run for years: 3.0-litre diesel, 4×4, 3.5 tonnes of towing, one tonne in the bed.',
    about: 'The D-Max is Isuzu’s workhorse: a 3.0-litre turbo-diesel with 190 PS, selectable four-wheel drive, a one-tonne payload and 3.5 tonnes of towing. Double cab for crews, single cab for loads. Parts and service at Koncept Autocentre, Isolo.',
    highlights: ['3.0-litre turbo-diesel, 190 PS', '4×4 with low range', '3.5-tonne towing, 1-tonne payload', 'Double or single cab', 'Serviced at Koncept Autocentre'],
    specs: [['Engine', '3.0 TD (4JJ3), 190 PS'], ['Drive', '4×4, automatic'], ['Seats', '5'], ['Payload', 'About 1,000 kg'], ['Towing', '3,500 kg']],
    price: 66_500_000, listPrice: 69_500_000, offerLabel: 'Season offer', offerUntil: '30 November 2026', priceNote: 'Indicative price, double cab 4×4 automatic; single cab 4×2 from about ₦44m.' },
  { id: 'foton-tunland', category: 'pickups', kind: 'Double-cab pickup', brand: 'Foton', name: 'Foton Tunland', art: 'pickup', badge: 'Best value',
    blurb: 'The hard-working Tunland: 2.8-litre Cummins diesel, double cab, 4×2 or 4×4 — the pickup that pays for itself.',
    about: 'Foton’s Tunland has carried Nigerian fleets for a decade: a 2.8-litre Cummins turbo-diesel, a double cab, 4×2 or 4×4, and a bed that takes a tonne. Simple to service, with parts stocked by Kewalram Nigeria.',
    highlights: ['2.8-litre Cummins turbo-diesel', 'Double cab, 4×2 or 4×4', 'One-tonne payload', 'Parts stocked in Lagos', 'Fleet servicing programmes'],
    specs: [['Engine', '2.8 TD Cummins ISF, about 163 PS'], ['Drive', '4×2 or 4×4, manual'], ['Seats', '5'], ['Payload', 'About 1,000 kg']],
    price: 44_500_000, listPrice: 47_000_000, offerLabel: 'Season offer', offerUntil: '30 November 2026', priceNote: 'Indicative price, double cab 4×2, including VAT and Lagos delivery.' },
  { id: 'foton-tunland-g7', category: 'pickups', kind: 'Premium double-cab pickup', brand: 'Foton', name: 'Foton Tunland G7 Premium', art: 'pickup', badge: 'New',
    blurb: 'The new-generation Tunland: 2.0-litre diesel, eight-speed automatic, driver assistance and a large screen.',
    about: 'The G7 is the Tunland’s premium generation — a 2.0-litre turbo-diesel with an eight-speed automatic, driver-assistance systems, a large touch screen and a quieter cabin — for owner-drivers who want a pickup that doubles as the family car.',
    highlights: ['2.0-litre turbo-diesel, eight-speed automatic', 'Driver-assistance systems', 'Large touch screen', '4×4 available', 'Parts stocked in Lagos'],
    specs: [['Engine', '2.0 TD, about 160 PS'], ['Drive', '4×2 or 4×4, 8-speed automatic'], ['Seats', '5'], ['Payload', 'About 1,000 kg']],
    price: 58_900_000, listPrice: 62_000_000, offerLabel: 'Launch price', offerUntil: '31 December 2026', priceNote: 'Indicative price, 4×2 automatic; 4×4 on request.' },

  // ── Trucks: Isuzu Q and N series (Koncept Autocentre) ──
  { id: 'isuzu-qlr', category: 'trucks', kind: 'Light truck, 4.1 t', brand: 'Isuzu', name: 'Isuzu QLR (Q-series)', art: 'truck', badge: 'Entry truck',
    blurb: 'Isuzu’s most affordable truck: 4.1-tonne GVW, 4JB1 diesel, cab-chassis for a box, cage or flatbed.',
    about: 'The Q-series is Isuzu’s light-duty line below the N-series. The QLR is a 4.1-tonne GVW 4×2 with the proven 4JB1 diesel — a cab-chassis for a box body, a cage or a flatbed, for distribution runs inside the city.',
    highlights: ['4.1-tonne gross vehicle weight', '4JB1 diesel, 57 kW', 'Cab-chassis: box, cage or flatbed bodies', 'Lowest running cost in the range', 'Isuzu parts and service at Koncept'],
    specs: [['Engine', '4JB1 diesel, 57 kW (78 PS)'], ['GVW', '4,100 kg'], ['Payload', 'About 2,000 kg'], ['Drive', '4×2'], ['Body', 'Cab-chassis, bodies fitted locally']],
    price: 34_900_000, listPrice: 36_500_000, offerLabel: 'Season offer', offerUntil: '30 November 2026', priceNote: 'Indicative price, cab-chassis; body built to order.' },
  { id: 'isuzu-qmr', category: 'trucks', kind: 'Light truck, 5.2 t', brand: 'Isuzu', name: 'Isuzu QMR (Q-series)', art: 'truck',
    blurb: 'The bigger Q: 5.2-tonne GVW on the same 4JB1 engine, for about three tonnes of load.',
    about: 'The QMR takes the Q-series to 5.2 tonnes gross — about three tonnes of payload — on the same 4JB1 diesel and 4×2 chassis, for distributors who have outgrown the QLR.',
    highlights: ['5.2-tonne gross vehicle weight', 'About 3-tonne payload', '4JB1 diesel', 'Box, cage, flatbed or tipper bodies', 'Isuzu parts and service at Koncept'],
    specs: [['Engine', '4JB1 diesel, 57 kW'], ['GVW', '5,200 kg'], ['Payload', 'About 3,000 kg'], ['Drive', '4×2']],
    price: 38_900_000, listPrice: 40_500_000, offerLabel: 'Season offer', offerUntil: '30 November 2026', priceNote: 'Indicative price, cab-chassis; body built to order.' },
  { id: 'isuzu-npr', category: 'trucks', kind: 'Medium-light truck, 6–7 t', brand: 'Isuzu', name: 'Isuzu NPR (N-series)', art: 'truck', badge: 'Best seller',
    blurb: 'Nigeria’s favourite N-series: 4JJ1 turbo-diesel, 6–7-tonne GVW, as a cargo, box, reefer or tipper.',
    about: 'The NPR is the N-series truck most Nigerian businesses buy: a 4JJ1 turbo-diesel with 131 PS, six to seven tonnes gross, wheelbases from 2.7 to 3.8 metres, and a body for every trade — cargo, box, refrigerated, tipper. A crew-cab version carries six.',
    highlights: ['4JJ1 turbo-diesel, 131 PS', '6.0–7.0-tonne GVW, 3.5–4-tonne payload', 'Cargo, box, reefer or tipper', 'Crew-cab option', 'Isuzu parts and service at Koncept'],
    specs: [['Engine', '4JJ1-TC, 131 PS'], ['GVW', '6,000–7,000 kg'], ['Payload', '3,500–4,000 kg'], ['Wheelbase', '2.7–3.8 m'], ['Drive', '4×2']],
    price: 54_000_000, listPrice: 57_000_000, offerLabel: 'Season offer', offerUntil: '30 November 2026', priceNote: 'Indicative price, cab-chassis; box and reefer bodies quoted separately.' },
  { id: 'isuzu-nqr', category: 'trucks', kind: 'Medium truck, 8 t', brand: 'Isuzu', name: 'Isuzu NQR (N-series)', art: 'truck',
    blurb: 'The strongest N-series: 4HK1 turbo-diesel with 150 PS, 8-tonne GVW, and a 33-seat bus version.',
    about: 'The NQR is the top of the N-series: a 4HK1 turbo-diesel with 150 PS, eight tonnes gross and up to five tonnes of payload on wheelbases to 4.1 metres. It is also the chassis of Isuzu’s 33-seat bus.',
    highlights: ['4HK1 turbo-diesel, 150 PS', '8-tonne GVW, up to 5-tonne payload', 'Cargo, box, tipper or 33-seat bus', 'Wheelbase to 4.1 m', 'Isuzu parts and service at Koncept'],
    specs: [['Engine', '4HK1-TCN, 150 PS'], ['GVW', '8,000 kg'], ['Payload', 'Up to 5,000 kg'], ['Wheelbase', '3.3–4.1 m'], ['Drive', '4×2']],
    price: 62_500_000, listPrice: 65_500_000, offerLabel: 'Season offer', offerUntil: '30 November 2026', priceNote: 'Indicative price, cab-chassis; bus body quoted separately.' },

  // ── Buses and vans: Foton View (Kewalram Nigeria) ──
  { id: 'foton-view-c2-classic', category: 'buses', kind: '15–17-seat minibus', brand: 'Foton', name: 'Foton View C2 Classic', art: 'minibus', badge: 'Transport operators',
    blurb: 'The transport operator’s bus: 15 to 17 seats, a 2.4-litre petrol engine that runs on CNG too, built for daily routes.',
    about: 'The View C2 Classic is the Foton minibus for intercity and staff routes: 15 to 17 seats, a 2.4-litre petrol engine (CNG conversion available), simple mechanicals and parts stocked by Kewalram Nigeria.',
    highlights: ['15–17 seats', '2.4-litre petrol; CNG option', 'Air-conditioned', 'Parts stocked in Lagos', 'Fleet servicing programmes'],
    specs: [['Engine', '2.4 petrol'], ['Seats', '15–17'], ['Drive', 'Rear-wheel drive, manual'], ['Fuel', 'Petrol or CNG']],
    price: 46_500_000, listPrice: 48_500_000, offerLabel: 'Season offer', offerUntil: '30 November 2026', priceNote: 'Indicative price including VAT and Lagos delivery.' },
  { id: 'foton-view-c2-premium', category: 'buses', kind: '15-seat executive minibus', brand: 'Foton', name: 'Foton View C2 Premium', art: 'minibus', badge: 'Staff bus',
    blurb: 'The executive View: 15 leather seats, cold air-conditioning and a quieter cabin — the staff and VIP shuttle.',
    about: 'The View C2 Premium is the executive version: fifteen leather seats, dual air-conditioning, a quieter cabin and a higher trim, for staff shuttles, hotels and VIP transport.',
    highlights: ['15 leather seats', 'Dual air-conditioning', 'Executive trim', '2.4-litre petrol', 'Parts stocked in Lagos'],
    specs: [['Engine', '2.4 petrol'], ['Seats', '15'], ['Drive', 'Rear-wheel drive, manual'], ['Trim', 'Leather, dual AC']],
    price: 59_900_000, listPrice: 63_000_000, offerLabel: 'Season offer', offerUntil: '30 November 2026', priceNote: 'Indicative price including VAT and Lagos delivery.' },
  { id: 'foton-view-cs2-cargo', category: 'buses', kind: 'Panel van', brand: 'Foton', name: 'Foton View CS2 Cargo Van', art: 'minibus',
    blurb: 'The View as a panel van: about 1.2 tonnes of goods behind two seats, for deliveries inside the city.',
    about: 'The CS2 Cargo is the View’s panel-van version: two or three seats, a flat load floor and about 1.2 tonnes of payload — for courier, retail and pharmaceutical deliveries inside the city.',
    highlights: ['About 1.2-tonne payload', 'Flat load floor, side and rear doors', '2.4-litre petrol', 'Parts stocked in Lagos'],
    specs: [['Engine', '2.4 petrol'], ['Seats', '2–3'], ['Payload', 'About 1,200 kg'], ['Drive', 'Rear-wheel drive, manual']],
    price: 42_500_000, listPrice: 44_500_000, offerLabel: 'Season offer', offerUntil: '30 November 2026', priceNote: 'Indicative price including VAT and Lagos delivery.' },

  // ── Tyres: Bridgestone and Firestone (Asahi Brands) ──
  { id: 'tyre-bs-265-65-17', category: 'tyres', kind: 'SUV / pickup tyre', brand: 'Bridgestone', name: 'Bridgestone Dueler H/T 265/65 R17', art: 'tyre', badge: 'Fits D-Max, mu-X, Hilux',
    blurb: 'The SUV and pickup tyre for Nigerian roads, fitted and balanced in our workshop.',
    about: 'Bridgestone’s Dueler H/T in 265/65 R17 fits the D-Max, mu-X and most mid-size SUVs and pickups: a highway-terrain tread for tarmac with the sidewall strength for laterite. Fitted, balanced and aligned at the group’s workshop, with a tyre warranty from Asahi Brands.',
    highlights: ['Fits D-Max, mu-X, Hilux and most mid-size SUVs', 'Fitted, balanced and aligned', 'Manufacturer warranty through Asahi Brands', 'Buy four, alignment free'],
    specs: [['Size', '265/65 R17'], ['Pattern', 'Dueler H/T'], ['Use', 'SUV and pickup, highway terrain']],
    price: 85_000, listPrice: 92_000, offerLabel: 'Set of four', offerUntil: '30 November 2026', priceNote: 'Price per tyre, fitting and balancing included; set of four with free alignment.' },
  { id: 'tyre-bs-265-60-18', category: 'tyres', kind: 'SUV tyre', brand: 'Bridgestone', name: 'Bridgestone Dueler H/T 265/60 R18', art: 'tyre',
    blurb: 'For larger SUVs on 18-inch wheels — Prado-class and the SOUEAST S09.',
    about: 'The 265/60 R18 Dueler H/T for larger SUVs on 18-inch wheels: quiet on the expressway, strong on broken roads. Fitted and balanced in our workshop.',
    highlights: ['Fits Prado-class SUVs and the S09', 'Fitted, balanced and aligned', 'Manufacturer warranty through Asahi Brands'],
    specs: [['Size', '265/60 R18'], ['Pattern', 'Dueler H/T 684'], ['Use', 'SUV, highway terrain']],
    price: 98_000, listPrice: 105_000, offerLabel: 'Set of four', offerUntil: '30 November 2026', priceNote: 'Price per tyre, fitting and balancing included.' },
  { id: 'tyre-bs-215-60-16', category: 'tyres', kind: 'Compact SUV tyre', brand: 'Bridgestone', name: 'Bridgestone Turanza 215/60 R16', art: 'tyre',
    blurb: 'The quiet touring tyre for compact SUVs and saloons — the S05 and S06 size.',
    about: 'Bridgestone’s Turanza in 215/60 R16: a touring tyre for compact SUVs and saloons, built for comfort and wet grip. Fitted and balanced in our workshop.',
    highlights: ['Fits the SOUEAST S05 and S06 and most saloons', 'Quiet, long-wearing touring tread', 'Fitted, balanced and aligned'],
    specs: [['Size', '215/60 R16'], ['Pattern', 'Turanza'], ['Use', 'Compact SUV and saloon']],
    price: 64_000, listPrice: 69_000, offerLabel: 'Set of four', offerUntil: '30 November 2026', priceNote: 'Price per tyre, fitting and balancing included.' },
  { id: 'tyre-fs-750-r16', category: 'tyres', kind: 'Light-truck tyre', brand: 'Firestone', name: 'Firestone 7.50 R16 LT', art: 'tyre', badge: 'Fits NPR, Q-series, View',
    blurb: 'The light-truck and minibus tyre: Isuzu NPR and Q-series, Foton View — fitted in the workshop.',
    about: 'Firestone’s 7.50 R16 light-truck tyre fits the Isuzu N- and Q-series, the Foton View minibus and most light trucks and buses: a reinforced carcass for loads, fitted and balanced in our workshop.',
    highlights: ['Fits Isuzu NPR, NQR, Q-series and Foton View', 'Reinforced for loads', 'Fitted and balanced', 'Fleet pricing on six or more'],
    specs: [['Size', '7.50 R16 LT'], ['Use', 'Light truck and minibus']],
    price: 125_000, listPrice: 135_000, offerLabel: 'Fleet price', offerUntil: '30 November 2026', priceNote: 'Price per tyre, fitting included; fleet price on six or more.' },

  // ── Parts and consumables ──
  { id: 'part-battery-75', category: 'parts', kind: 'Battery', brand: 'Genuine', name: 'Battery, 75 Ah, maintenance-free', art: 'battery',
    blurb: 'A maintenance-free 75 Ah battery for SUVs, pickups and minibuses, fitted while you wait, with a 12-month warranty.',
    about: 'A maintenance-free 75 Ah battery that fits most SUVs, pickups and minibuses we sell. Tested, fitted while you wait, old battery taken back for recycling. Twelve-month warranty.',
    highlights: ['Fits most SUVs, pickups and minibuses', 'Fitted while you wait', 'Old battery recycled', '12-month warranty'],
    specs: [['Capacity', '75 Ah'], ['Type', 'Maintenance-free'], ['Warranty', '12 months']],
    price: 82_000, listPrice: 90_000, offerLabel: 'Fitted price', offerUntil: '30 November 2026', priceNote: 'Fitted price; old battery returned for recycling.' },
  { id: 'part-oil-5w30', category: 'parts', kind: 'Engine oil', brand: 'Genuine', name: 'Engine oil 5W-30 fully synthetic, 4 litres', art: 'oil',
    blurb: 'Fully synthetic 5W-30 for petrol SUVs, with the filter change done in the workshop.',
    about: 'Fully synthetic 5W-30 engine oil in a four-litre pack, the grade specified for the SOUEAST range and most modern petrol engines. Buy it with the service and the filter change is done in the workshop.',
    highlights: ['Fully synthetic 5W-30', '4-litre pack', 'Grade specified for SOUEAST and most petrol SUVs', 'Fitted with the service'],
    specs: [['Grade', '5W-30, fully synthetic'], ['Pack', '4 litres']],
    price: 32_000, listPrice: 36_000, offerLabel: 'Service price', offerUntil: '30 November 2026', priceNote: 'Price per 4-litre pack; labour included with a booked service.' },
  { id: 'part-oil-filter', category: 'parts', kind: 'Oil filter', brand: 'Genuine', name: 'Genuine oil filter (Isuzu, Foton, SOUEAST)', art: 'part',
    blurb: 'The right genuine filter for your engine, matched by chassis number so it fits first time.',
    about: 'Genuine oil filters for the Isuzu 4JB1, 4JJ1 and 4HK1 diesels, the Foton Cummins and View engines, and the SOUEAST turbo petrols — matched to your vehicle by chassis number at the counter.',
    highlights: ['Genuine, matched by chassis number', 'Isuzu, Foton and SOUEAST engines', 'Fitted with the service'],
    specs: [['Fits', 'Isuzu 4JB1 / 4JJ1 / 4HK1, Foton, SOUEAST'], ['Type', 'Spin-on or cartridge, by engine']],
    price: 12_500, listPrice: 14_000, offerLabel: 'Service price', offerUntil: '30 November 2026', priceNote: 'Indicative price; the exact filter and price depend on the engine.' },
  { id: 'part-brake-pads', category: 'parts', kind: 'Brake pads', brand: 'Genuine', name: 'Genuine front brake pads, set', art: 'part',
    blurb: 'A full set of genuine front pads for the D-Max, mu-X, Tunland and SOUEAST range, fitted and bedded in.',
    about: 'Genuine front brake pads for the D-Max, mu-X, Foton Tunland and the SOUEAST range: a full axle set, fitted in the workshop with discs checked and the brakes bedded in before you drive away.',
    highlights: ['Genuine, full axle set', 'D-Max, mu-X, Tunland, SOUEAST', 'Discs checked, brakes bedded in', 'Fitted in the workshop'],
    specs: [['Position', 'Front axle, set of four pads'], ['Fits', 'D-Max, mu-X, Tunland, SOUEAST S05–S09']],
    price: 68_000, listPrice: 75_000, offerLabel: 'Fitted price', offerUntil: '30 November 2026', priceNote: 'Indicative fitted price; the exact set depends on the model.' },
];

export const OFFERS: { kicker: string; title: string; text: string; cta: string; href: string; tint: string; mark: string }[] = [
  { kicker: 'Launch offer', title: 'SOUEAST: first two services free', text: 'On every S05, S06, S07 and S09 ordered before 31 December 2026 — plus the five-year, 100,000 km warranty.', cta: 'See the SUVs', href: '/store?c=suvs', tint: 'linear-gradient(135deg, #0b2416 0%, #22983f 100%)', mark: 'S' },
  { kicker: 'Fleet programme', title: 'Five trucks or more: one account manager', text: 'Isuzu N- and Q-series and Foton pickups and buses, with scheduled servicing and parts stocked for your models.', cta: 'See the trucks', href: '/store?c=trucks', tint: 'linear-gradient(135deg, #1a1f2b 0%, #c0392b 100%)', mark: 'N' },
  { kicker: 'Tyres and parts', title: 'Buy four tyres, alignment free', text: 'Bridgestone and Firestone fitted and balanced in our workshop; genuine parts matched by chassis number.', cta: 'See tyres', href: '/store?c=tyres', tint: 'linear-gradient(135deg, #1a1a1a 0%, #555 100%)', mark: '4' },
];

export const REFERRAL = {
  rewards: [
    { what: 'A vehicle sold', reward: '₦150,000' },
    { what: 'A fleet of five or more', reward: '₦1,000,000' },
    { what: 'Parts and tyres', reward: '5% of the order' },
  ],
  steps: ['Send us the buyer’s name and number (or your own, if you sell for us).', 'The sales team calls within a working day and quotes with your name on the file.', 'When the sale completes and the vehicle is delivered, you are paid within 14 days — by transfer, with a statement.'],
  terms: 'Rewards are paid on completed, delivered sales to buyers not already in our records in the last 90 days. One referrer per buyer, the first to reach us. Referral partners sign a short agreement and receive a code and a rate card.',
};
