-- The first stories for News & media (v41), from the public record, so the
-- website is not empty and the communications team has something to edit.
-- Inserted once, only when the organisation has no stories yet and the
-- platform serves exactly one active organisation. Additive; re-runnable.
DO $$
DECLARE org text;
BEGIN
  IF (SELECT count(*) FROM "organisations" WHERE "isActive") <> 1 THEN RETURN; END IF;
  SELECT "id" INTO org FROM "organisations" WHERE "isActive" LIMIT 1;
  IF EXISTS (SELECT 1 FROM "news_posts" WHERE "organisationId" = org) THEN RETURN; END IF;

  INSERT INTO "news_posts" ("id", "organisationId", "slug", "title", "summary", "body", "category", "status", "isFeatured", "businessArea", "publishedAt", "authorName", "createdAt", "updatedAt")
  VALUES ('news_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), org, 'soueast-passenger-vehicle-assembly-begins-in-lagos', 'SOUEAST passenger-vehicle assembly begins in Lagos', 'The first locally assembled SOUEAST SUVs are rolling off the line at the group’s Automobiles Manufacturing Hub in Isolo — a passenger-car milestone for a plant that began with trucks.', 'In September 2026 the group’s Automobiles Manufacturing Hub at the Afprint Industrial Estate in Isolo, Lagos, began assembling SOUEAST passenger vehicles — the first passenger cars built on a line that opened in 2016 with Nigeria’s first locally assembled Foton truck.

## From trucks to family cars

The hub was inaugurated in April 2016 with three assembly zones: trucks; cars, pickups and minibuses; and two- and three-wheelers. For a decade its passenger-car zone waited for the right partner. SOUEAST — launched in Nigeria in April 2026 with the S05, S06, S07 and S09 SUVs and a five-year or 100,000 km warranty — brings it to life.

## What it means

- **Jobs and skills.** Technicians trained on body, trim and final-inspection stations, with pre-delivery inspection (PDI) done on site before a vehicle reaches a showroom.
- **Faster delivery.** Vehicles assembled in Lagos reach customers without the weeks at sea and at the port.
- **A local supply chain.** Tyres, batteries, lubricants and consumables sourced from the group’s own distribution businesses and Nigerian suppliers where quality allows.

Every assembled vehicle carries the same warranty and after-sales support as an imported one, serviced at the group’s workshops in Lagos.', 'MILESTONE'::"NewsCategory", 'PUBLISHED'::"NewsStatus", TRUE, 'Automotive', '2026-09-15 00:00:00+01', 'Corporate Communications', now(), now());
  INSERT INTO "news_posts" ("id", "organisationId", "slug", "title", "summary", "body", "category", "status", "isFeatured", "businessArea", "publishedAt", "authorName", "createdAt", "updatedAt")
  VALUES ('news_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), org, 'soueast-suv-range-launched-in-nigeria', 'SOUEAST SUV range launched in Nigeria', 'Four SUVs — the S05, S06, S07 and S09 — arrive with a five-year or 100,000 km warranty, and a commitment to assemble locally within the year.', 'The group introduced the SOUEAST brand to Nigeria at a launch in Lagos in April 2026, opening with four SUVs: the compact S05, the S06 and S07 for families and fleets, and the flagship S09.

## Built for Nigerian roads

Each model is specified for local conditions — ground clearance, cooling and suspension tuned for heat, dust and uneven surfaces — and comes with a **five-year or 100,000 km warranty**, backed by the group’s own workshops and parts supply.

## Local assembly from the start

The launch came with a commitment: the S06 and S07 would be assembled at the group’s Lagos manufacturing hub within the year. That line started in September 2026.

Test drives and bookings are available through the group’s showrooms and the customer portal.', 'NEWS'::"NewsCategory", 'PUBLISHED'::"NewsStatus", FALSE, 'Automotive', '2026-04-22 00:00:00+01', 'Corporate Communications', now(), now());
  INSERT INTO "news_posts" ("id", "organisationId", "slug", "title", "summary", "body", "category", "status", "isFeatured", "businessArea", "publishedAt", "authorName", "createdAt", "updatedAt")
  VALUES ('news_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), org, 'afcott-grains-opens-multi-grain-processing-plant-in-kano', 'Afcott Grains opens a multi-grain processing plant in Kano', 'A new plant to clean, sort and process 40,000 tonnes of sesame and 25,000 tonnes of other grains a year, creating more than 500 jobs — most of them in Kano.', 'Afcott Grains Limited inaugurated its multi-grain processing plant in Kano in April 2026, at a ceremony attended by the Federal Government’s representatives and the Kano State Government.

## Capacity

- **40,000 tonnes** of sesame a year, cleaned and sorted to export grade
- **25,000 tonnes** of other grains and oilseeds
- **500+ jobs**, about seventy per cent of them filled from Kano

## Why it matters

The plant moves value addition closer to the farm: grain is bought from smallholders in the north, processed in Kano and sold into Nigeria’s food industry and to export markets, instead of leaving the country raw. It joins the group’s agricultural businesses in Yola, Zaria and Lagos — cotton, oilseeds, poultry feed and farm inputs — built over fifty years.', 'MILESTONE'::"NewsCategory", 'PUBLISHED'::"NewsStatus", FALSE, 'Agriculture', '2026-04-10 00:00:00+01', 'Corporate Communications', now(), now());
  INSERT INTO "news_posts" ("id", "organisationId", "slug", "title", "summary", "body", "category", "status", "isFeatured", "businessArea", "publishedAt", "authorName", "createdAt", "updatedAt")
  VALUES ('news_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), org, 'ten-years-of-assembling-vehicles-in-nigeria', 'Ten years of assembling vehicles in Nigeria', 'In April 2016 the first Nigeria-assembled Foton truck left the group’s hub in Isolo. A decade on, the same site builds trucks, pickups, minibuses and now passenger SUVs.', 'On 2 April 2016 the group opened its Automobiles Manufacturing Hub on the Afprint Industrial Estate, Oshodi-Apapa Expressway, Isolo — about 10,000 square metres under cover and 6,000 in the open, with a hundred skilled workers on the first shift.

## The first decade

1. **2016** — the first locally assembled Foton Daimler AUMAN truck.
2. **2017** — Massilia Motors, the group’s joint venture with CFAO, takes on Mitsubishi in Nigeria.
3. **2023** — Isuzu, represented by Koncept Autocentre, backs local assembly of its light and medium trucks.
4. **2026** — SOUEAST SUVs: the passenger-car zone comes into use.

The hub was designed for roughly 200,000 units a year across trucks, cars, minibuses and two- and three-wheelers — capacity the group fills step by step, as each brand earns its place on the line.', 'NEWS'::"NewsCategory", 'PUBLISHED'::"NewsStatus", FALSE, 'Automotive', '2026-04-02 00:00:00+01', NULL, now(), now());
END $$;
