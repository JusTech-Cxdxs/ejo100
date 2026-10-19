/**
 * The first stories, written from the public record (press and the group's
 * own milestones page) — shown until the communications team publishes its
 * own from the staff portal (News & media), and seeded there on first deploy
 * so the team can edit them. Dates are Lagos days.
 */
export type Story = {
  slug: string; title: string; summary: string; body: string; category: 'NEWS' | 'MILESTONE' | 'PRESS_RELEASE' | 'EVENT' | 'COMMUNITY';
  businessArea: string | null; publishedAt: string; isFeatured: boolean; coverImageUrl: string | null; coverAlt: string | null; authorName: string | null;
};

export const FIRST_STORIES: Story[] = [
  {
    slug: 'soueast-passenger-vehicle-assembly-begins-in-lagos',
    title: 'SOUEAST passenger-vehicle assembly begins in Lagos',
    summary: 'The first locally assembled SOUEAST SUVs are rolling off the line at the group’s Automobiles Manufacturing Hub in Isolo — a passenger-car milestone for a plant that began with trucks.',
    category: 'MILESTONE', businessArea: 'Automotive', publishedAt: '2026-09-15', isFeatured: true, coverImageUrl: null, coverAlt: null, authorName: 'Corporate Communications',
    body: `In September 2026 the group’s Automobiles Manufacturing Hub at the Afprint Industrial Estate in Isolo, Lagos, began assembling SOUEAST passenger vehicles — the first passenger cars built on a line that opened in 2016 with Nigeria’s first locally assembled Foton truck.

## From trucks to family cars

The hub was inaugurated in April 2016 with three assembly zones: trucks; cars, pickups and minibuses; and two- and three-wheelers. For a decade its passenger-car zone waited for the right partner. SOUEAST — launched in Nigeria in April 2026 with the S05, S06, S07 and S09 SUVs and a five-year or 100,000 km warranty — brings it to life.

## What it means

- **Jobs and skills.** Technicians trained on body, trim and final-inspection stations, with pre-delivery inspection (PDI) done on site before a vehicle reaches a showroom.
- **Faster delivery.** Vehicles assembled in Lagos reach customers without the weeks at sea and at the port.
- **A local supply chain.** Tyres, batteries, lubricants and consumables sourced from the group’s own distribution businesses and Nigerian suppliers where quality allows.

Every assembled vehicle carries the same warranty and after-sales support as an imported one, serviced at the group’s workshops in Lagos.`,
  },
  {
    slug: 'soueast-suv-range-launched-in-nigeria',
    title: 'SOUEAST SUV range launched in Nigeria',
    summary: 'Four SUVs — the S05, S06, S07 and S09 — arrive with a five-year or 100,000 km warranty, and a commitment to assemble locally within the year.',
    category: 'NEWS', businessArea: 'Automotive', publishedAt: '2026-04-22', isFeatured: false, coverImageUrl: null, coverAlt: null, authorName: 'Corporate Communications',
    body: `The group introduced the SOUEAST brand to Nigeria at a launch in Lagos in April 2026, opening with four SUVs: the compact S05, the S06 and S07 for families and fleets, and the flagship S09.

## Built for Nigerian roads

Each model is specified for local conditions — ground clearance, cooling and suspension tuned for heat, dust and uneven surfaces — and comes with a **five-year or 100,000 km warranty**, backed by the group’s own workshops and parts supply.

## Local assembly from the start

The launch came with a commitment: the S06 and S07 would be assembled at the group’s Lagos manufacturing hub within the year. That line started in September 2026.

Test drives and bookings are available through the group’s showrooms and the customer portal.`,
  },
  {
    slug: 'afcott-grains-opens-multi-grain-processing-plant-in-kano',
    title: 'Afcott Grains opens a multi-grain processing plant in Kano',
    summary: 'A new plant to clean, sort and process 40,000 tonnes of sesame and 25,000 tonnes of other grains a year, creating more than 500 jobs — most of them in Kano.',
    category: 'MILESTONE', businessArea: 'Agriculture', publishedAt: '2026-04-10', isFeatured: false, coverImageUrl: null, coverAlt: null, authorName: 'Corporate Communications',
    body: `Afcott Grains Limited inaugurated its multi-grain processing plant in Kano in April 2026, at a ceremony attended by the Federal Government’s representatives and the Kano State Government.

## Capacity

- **40,000 tonnes** of sesame a year, cleaned and sorted to export grade
- **25,000 tonnes** of other grains and oilseeds
- **500+ jobs**, about seventy per cent of them filled from Kano

## Why it matters

The plant moves value addition closer to the farm: grain is bought from smallholders in the north, processed in Kano and sold into Nigeria’s food industry and to export markets, instead of leaving the country raw. It joins the group’s agricultural businesses in Yola, Zaria and Lagos — cotton, oilseeds, poultry feed and farm inputs — built over fifty years.`,
  },
  {
    slug: 'ten-years-of-assembling-vehicles-in-nigeria',
    title: 'Ten years of assembling vehicles in Nigeria',
    summary: 'In April 2016 the first Nigeria-assembled Foton truck left the group’s hub in Isolo. A decade on, the same site builds trucks, pickups, minibuses and now passenger SUVs.',
    category: 'NEWS', businessArea: 'Automotive', publishedAt: '2026-04-02', isFeatured: false, coverImageUrl: null, coverAlt: null, authorName: null,
    body: `On 2 April 2016 the group opened its Automobiles Manufacturing Hub on the Afprint Industrial Estate, Oshodi-Apapa Expressway, Isolo — about 10,000 square metres under cover and 6,000 in the open, with a hundred skilled workers on the first shift.

## The first decade

1. **2016** — the first locally assembled Foton Daimler AUMAN truck.
2. **2017** — Massilia Motors, the group’s joint venture with CFAO, takes on Mitsubishi in Nigeria.
3. **2023** — Isuzu, represented by Koncept Autocentre, backs local assembly of its light and medium trucks.
4. **2026** — SOUEAST SUVs: the passenger-car zone comes into use.

The hub was designed for roughly 200,000 units a year across trucks, cars, minibuses and two- and three-wheelers — capacity the group fills step by step, as each brand earns its place on the line.`,
  },
];
