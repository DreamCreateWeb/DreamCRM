# In-office (chairside) 3D printing in US dental practices, and a 3D-printing library / companion tool opportunity (as of Nov 2026)

Research depth note: about 16 tool calls, mostly web search snippets plus 4 page fetches. Several questions (communities, library download counts, FDA classification of guards, current adoption) came back thin. Those are flagged in Gaps instead of being filled with guesses.

## Adoption: share of US practices, growth, printers and prices

### Takeaway
The only authoritative US figure found is the ADA Clinical Evaluators (ACE) Panel survey (fielded 2022, published 2023): 17% of 277 responding dentists had a 3D printer, two-thirds of them for under 2 years. No newer ADA percentage was found. Printer prices cluster around $6k-$10k for the printer alone and roughly $16k-$20k+ for a complete ecosystem, depending on whose comparison you believe.

### Cited Findings
- ACE Panel survey, 277 respondents: 17% currently use a 3D printer; 67% of those users had used one for less than two years; nearly half print for at least a quarter of their cases each month. Authors Drs. Frazier and Revilla-Leon say it "is growing due to workflow efficiencies and expanded applications." — [ADA News, May 2023](https://adanews.ada.org/ada-news/2023/may/ace-panel-report-finds-3d-printing-not-common-in-dental-offices-but-users-report-benefits/)
- Non-users: top reasons were that a dental laboratory makes their devices (44%), high financial investment (39%), and no perceived benefit (34%); 21% were considering buying a printer and 35% considering training. (Percentages from the search summary of the JADA paper; the ADA News page confirms the 21% and 35%.) — [ADA News](https://adanews.ada.org/ada-news/2023/may/ace-panel-report-finds-3d-printing-not-common-in-dental-offices-but-users-report-benefits/); [Becker's Dental](https://beckersdental.com/dental-technology/40971-only-17-of-private-practice-dentists-use-3d-printers-despite-benefits.html)
- Adopters' reasons: efficiency (68%), reduced cost (44%); problems reported were software issues and printing failures. — [ADA News](https://adanews.ada.org/ada-news/2023/may/ace-panel-report-finds-3d-printing-not-common-in-dental-offices-but-users-report-benefits/)
- Source paper: "Prevalence and applications of 3-dimensional printers in dental practice: An ADA Clinical Evaluators Panel survey," JADA, April 2023. — [UB research record](https://researchconnect.buffalo.edu/en/publications/prevalence-and-applications-of-3-dimensional-printers-in-dental-p/)
- A separate survey of orthodontists in North America found 46.9% had a 3D printer in the office (not general dentists; different sample). — via search summary of [Dental Tribune](https://www.dental-tribune.com/news/new-study-investigates-3d-printing-use-in-dental-practice/) (not fetched; treat as unverified)
- ADA released a free 3D printing buyer's guide (Council on Dental Practice, Digital Dentistry Technology and Innovation subcommittee, with ADEA input) with a comparison chart of indications, features, initial investment and print times. — [ADA News, Aug 2023](https://adanews.ada.org/ada-news/2023/august/new-ada-3d-printing-guide-offers-insight-as-digital-workflow-technology-expands/)
- Market research (low quality, vendor-press-release style): dental clinics/practices are the fastest-growing end-user segment; labs are the largest (56.73%). Market-size estimates disagree (USD 4.17B for 2025 vs 4.35B for 2026). — [search results incl. BusinessWire/ResearchAndMarkets](https://www.businesswire.com/news/home/20250722276215/en)
- SprintRay calls itself the global leader; no independent share figure found. SprintRay acquired the EnvisionTEC/ETEC dental portfolio (announced Sept 2025 per search summary). — [SprintRay](https://sprintray.com/sprintray-acquires-envisiontec-dental-product-portfolio-expanding-commitment-to-3d-printing-in-dentistry/)
- Prices (vendor-sourced, dated 2025-2026, disputed between vendors): SprintRay Pro 2 printer alone $9,995 in SprintRay's store; Midas printer $9,995 (older pilot buy-in from $7,995); Formlabs Form 4B starting about $6,299 (with service plan), $7,899 with automated post-processing. Formlabs' comparison page shows "complete cost" of $19,915 for the Pro 2 ecosystem; SprintRay says hardware is only the start. — [SprintRay store](https://store.sprintray.com/shop/product/sri-0102046-sprintray-pro-2-3d-printer-3049); [Formlabs comparison](https://dental.formlabs.com/compare/formlabs-form-4b-vs-sprintray-pro-2/); [SprintRay cost page](https://sprintray.com/the-real-cost-of-a-dental-3d-printer-with-sprintray/)
- Printers named in use by an individual practitioner: Anycubic Photon Mono X (models), Ackuretta Sol and Desktop Health Einstein (restorations/prosthetics). — [Dental Economics, 2023](https://www.dentaleconomics.com/science-tech/article/14291900/the-true-impact-of-3d-printing-on-dental-practices)
- Consumer printers (Anycubic Photon Mono 4, Elegoo Saturn 4 Ultra / Mars 5, Phrozen Sonic Mini 8K S) are recommended on affiliate-style review sites for dental models; one guide says a hobby printer with standard grey model resin is fine for anything outside the mouth but not for guards, guides, try-in dentures or anything worn. — [ovrclock review](https://ovrclock.com/?p=89282) (affiliate; low reliability)

### Inferences
- With adoption at 17% in 2022 and two-thirds of users new, the current 2026 figure is likely materially higher, but no sourced number exists; do not quote 17% as current.
- A software product should assume a mixed installed base: premium closed ecosystems (SprintRay, Formlabs) and a long tail of open-platform and consumer printers.
- Practice type leaders (orthodontics, implant/prosthodontic, DSO) are suggested by the orthodontist figure but not established for general practices.

### Gaps
- No 2024-2026 ADA/HPI adoption percentage; no breakdown by practice type or by printer brand share; no sourced Asiga/Ackuretta prices.

## What practices print (patient and non-patient)

### Takeaway
Most often: diagnostic models, splints/occlusal devices and surgical guides; restorations and dentures at advanced practices. Non-patient utility prints (organizers, giveaways) are well supported as a hobby category on maker sites but I found no survey of dental offices doing it.

### Cited Findings
- ACE panel: models, splints/occlusal devices, surgical guides are most common. — [ADA News](https://adanews.ada.org/ada-news/2023/may/ace-panel-report-finds-3d-printing-not-common-in-dental-offices-but-users-report-benefits/)
- One practice prints veneers, inlays/onlays, crowns, Maryland bridges, splints, stayplates, dentures, models, wax-ups, surgical guides; assistants handle most printing tasks. — [Dental Economics](https://www.dentaleconomics.com/science-tech/article/14291900/the-true-impact-of-3d-printing-on-dental-practices)
- Vendors market night guards: claims of up to 8 full-arch guards in under 45 minutes (marketing). — [SprintRay](https://sprintray.com/digital-dentistry/3d-printed-night-guards/); [LuxCreo](https://luxcreo.com/how-to-develop-high-quality-night-guards-and-retainers-with-3d-printing/)
- Maker-site items exist for the office: MakerWorld "dentist desk organizer" / scrub-top pen holder models; a "Dental Veneer Cleaning Box" for etching and washing veneers in an office sink; Printables "Another organizer not only for dentists" (Jan 2021). — [MakerWorld model](https://makerworld.com/models/2273294); [Printables](https://www.printables.com/model/52373-boxes)

### Inferences
- Bur blocks, tray holders, kids' prizes and giveaways are plausible but not evidenced in the sources found.

### Gaps
- No survey data on non-patient utility printing in dental offices; custom trays and aligners in-office share not quantified.

## Workflow, software and pain points

### Takeaway
Pain points documented: learning curve, calibration, resin preparation/handling, fragile resin tank liners, software issues and print failures. Cost-per-print and settings references are mostly vendor-tied.

### Cited Findings
- Practitioner: machines "finicky and hard to calibrate"; early dental design software limited so he used free Meshmixer; improper resin preparation caused most initial failures; resin care is the most intricate setup part; metal instruments damage the tank liner. — [Dental Economics](https://www.dentaleconomics.com/science-tech/article/14291900/the-true-impact-of-3d-printing-on-dental-practices)
- Adopters' reported problems: software issues and printing failures. — [ADA News](https://adanews.ada.org/ada-news/2023/may/ace-panel-report-finds-3d-printing-not-common-in-dental-offices-but-users-report-benefits/)
- SprintRay printers report progress to a cloud SprintRay Dashboard. — [Dentaltown, 2019](https://www.dentaltown.com/magazine/article/7623/product-profile-sprintray-pro)

### Inferences
- Unmet needs fit a print log (who/what/for which patient, resin lot, outcome) and failed-print tracking, but no source directly confirms demand.

### Gaps
- Nothing found on exocad/3Shape/Medit/Blender usage rates, nesting/support pain, or patient-tracking pain.

## Existing libraries and licences

### Takeaway
Dental content on maker sites is mostly small, hobby or education oriented and carries per-model licences; NC licences would block redistribution in a paid product. Download counts and "most downloaded" rankings could not be retrieved.

### Cited Findings
- Thingiverse dental demonstration model (Feataur, 2015): CC Attribution-NonCommercial-ShareAlike. — [3dgo.app Thingiverse mirror](https://3dgo.app/models/thingiverse/833034)
- A MakerWorld teeth model is CC BY-NC-ND (no commercial use, no derivatives). — [MakerWorld](https://makerworld.com/en/models/1019257-human-teeth-model)
- MakerWorld dentist organizer models are under the "Standard Digital File License" (MakerWorld's user-content licence; terms not read). — [MakerWorld](https://makerworld.com/models/2273294)
- CGTrader dental models carry a "Royalty Free License" (terms not read; a marketplace licence typically does not permit redistributing the file itself, unverified). — [CGTrader](https://www.cgtrader.com/3d-print-models/science/biology/dental-practice-model-kit)
- NIH 3D Print Exchange hosts dental/anatomy entries (e.g. entry 3DPX-003002); licence not read. — [NIH 3D](https://3d.nih.gov/entries/3dpx-003002)
- Cults3D has a Dental category with a "most downloaded free STL" section (contents not retrieved). — [Cults3D](https://cults3d.com/en/categories/dental)
- UCSF library: a team started from an open Thingiverse teeth and mandible model for dental student training. — [UCSF](https://library.ucsf.edu/?p=43535)
- CC 3.0 NC text: "You may not exercise any of the rights granted to You in Section 3 above in any manner that is primarily intended for or directed toward commercial advantage or private monetary compensation." CC 4.0: NonCommercial "means not primarily intended for or directed towards commercial advantage or monetary compensation." — [CC BY-NC 3.0 legal code](https://creativecommons.org/licenses/by-nc/3.0/us/legalcode); [CC NonCommercial interpretation](https://wiki.creativecommons.org/NonCommercial_interpretation)

### Inferences
- A paid app redistributing NC or ND files would be high risk (my reading, not legal advice). Safe routes: original in-house designs, CC0, CC BY with attribution (BY-SA brings share-alike obligations), explicit written permission, or linking out to the original page rather than hosting.

### Gaps
- Not found: most-downloaded dental models and counts on Thingiverse, Printables, MakerWorld, Cults3D, MyMiniFactory; any vendor-run dental library (SprintRay, Formlabs) or paid library and their terms; Printables/Thingiverse site terms.

## Communities

### Takeaway
I could not verify any community size. Evidence is limited to a small education forum.

### Cited Findings
- ADEE 3D Special Interest Group forum for dental education: file sharing and equipment tips, about 88 members in one snapshot (Europe, education). — [ADEE forum](https://forum.adee.org/portal.php)
- Dentaltown has product profiles and podcasts on 3D printing, but no forum thread data was retrievable. — [Dentaltown](https://www.dentaltown.com/magazine/article/7623/product-profile-sprintray-pro)

### Gaps
- Facebook groups, subreddits, YouTube channels, member counts and top requests: not found; needs direct platform access.

## Regulation

### Takeaway
FDA regulates the output as a device, not the printer. Point-of-care printing policy remains a 2021 discussion paper (no confirmed final guidance found). Cleared resins matter (denture base resins are Class II under 21 CFR 872.3760).

### Cited Findings
- FDA does not regulate 3D printers themselves but the process and output where the output is a medical device; risk-based classes. — [Pew](https://www.pewtrusts.org/-/media/assets/2022/07/fdas-regulatory-framework-for-3d-printing-of-medical-devices.pdf)
- FDA Dec 2021 discussion paper on point-of-care printing is not guidance; comment docket FDA-2021-N-1272 closed Feb 8, 2022; Academy of General Dentistry commented. — [FDA](https://www.fda.gov/medical-devices/3d-printing-medical-devices/3d-printing-medical-devices-point-care-discussion-paper); [AGD](https://agd.org/constituent/news/2022/02/09/academy-of-general-dentistry-provides-comments-to-the-food-and-drug-administration)
- 3D-printable denture base resins are cleared as Class II, product code EBI (e.g. SprintRay K220979, Glidewell K241493, Aidite K242884). — [FDA product code EBI](https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfTPLC/tplc.cfm?id=EBI); [Innolitics K220979](https://fda.innolitics.com/device/K220979)
- No source found describing FDA enforcement against dental offices for point-of-care printing.

### Inferences
- A library of non-device items (organizers, teaching models, giveaways) and neutral reference/calculation tools stays clear of device claims. Distributing patient-specific appliance designs, or stating a resin/setting is "validated" or "approved" for a clinical use, risks device-manufacturer territory. Defer to the vendor's cleared validated workflow and link to it.

### Gaps
- FDA classification of occlusal guards (I did not verify 872.5570 or the guard classification), surgical guides and aligners; whether FDA issued draft guidance after 2022.

## Companion tools (calculators, settings references, print log)

### Takeaway
Only vendor-tied tools found; no independent cross-vendor tool or print log surfaced.

### Cited Findings
- Vendor ROI/cost calculators exist: SprintRay ROI calculator, Shining 3D ROI calculator, Straumann calculator (example inputs: reservoir $311, 250 jobs per reservoir). — [SprintRay](https://sprintray.com/roi-calculator/); [Shining 3D](https://www.shining3ddental.com/en/dental-roi-calculator); [Straumann](https://3dproicalculator.straumann.com/db/USA)
- Resin price examples: Formlabs model resin $80-$150/L, permanent crown resin $800-$850/L (reseller). Formlabs white paper gives a cost-per-part method (material, tank, labor; example 10 mL/part). — [Voxel Dental](https://learn.voxeldental.com/blog/how-much-does-formlabs-dental-resin-cost); [Formlabs](https://dental.formlabs.com/white-papers/total-cost-ownership-dental-labs-aligner-manufacturers/)
- Formlabs publishes print-speed tables by application and resin (closest to a settings reference). — [Formlabs support](https://formlabs.com/uk/support/Understanding-dental-application-print-speed-Form-4B/)

### Inferences
- Gap in market: vendor-neutral cost-per-print, print log and consumables tracking. Exposure/post-cure references are best linked to resin makers' own data sheets to avoid liability.

### Gaps
- No demand evidence (surveys, requests); no existing independent print-log product confirmed.

## Hobby-like enthusiasm among dentists

### Takeaway
Little direct evidence found.

### Cited Findings
- A practitioner began with FDM in 2017, tinkered with free tools (Meshmixer), runs three printers of mixed brands. — [Dental Economics](https://www.dentaleconomics.com/science-tech/article/14291900/the-true-impact-of-3d-printing-on-dental-practices)
- Reviewers testing consumer printers for dental models exist, indicating a hobbyist-leaning segment, but those are affiliate sites. — [ovrclock](https://ovrclock.com/?p=89282)

### Gaps
- No survey, forum or social evidence of dentists printing for fun, sharing prints, or printing kids' prizes.
