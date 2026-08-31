# Literature sources from the research report

These links were cited in the 32-page Deep Research report used to design the caffeine calculator:

**Caffeine Decay Mathematics in the Human Body: A Pharmacokinetic Basis for a Caffeine Calculator**

The numbering below follows the reference groupings in the report where practical. Several claims in the report point to the same underlying source.

## Population pharmacokinetics / model structure

- Population pharmacokinetics of caffeine in healthy male adults using mixed-effects models: https://pubmed.ncbi.nlm.nih.gov/19125908/
- Full-text mirror/source related to the same population-PK work: https://www.researchgate.net/publication/23760910_Population_pharmacokinetics_of_caffeine_in_healthy_male_adults_using_mixed-effects_models

## General caffeine pharmacology / half-life review

- NCBI Bookshelf, *Caffeine*: https://www.ncbi.nlm.nih.gov/books/NBK223808/

This review is one of the sources behind the project's use of a nominal adult half-life near 5 hours and the broad healthy-person literature range discussed in the report.

## Distribution volume / classic pharmacokinetics

- Clinical Pharmacology & Therapeutics DOI source: https://doi.org/10.1038/clpt.1982.132

## Smoking and caffeine clearance

- Parsons & Neims / smoking-related caffeine clearance source: https://pubmed.ncbi.nlm.nih.gov/657717/

The report cites this classic comparison when discussing mean half-lives around 3.5 h in smokers versus 6.0 h in nonsmokers.

## CYP1A2 genetics and environment interaction

- CYP1A2 genotype / caffeine phenotype study: https://pubmed.ncbi.nlm.nih.gov/10233211/

The report uses this work to support the decision **not** to convert rs762551 genotype alone into a fixed numerical half-life multiplier.

## Dose-dependent pharmacokinetics / nonlinear behaviour

- Dose-ranging caffeine pharmacokinetics: https://pubmed.ncbi.nlm.nih.gov/2328560/
- Additional dose-dependent pharmacokinetics source: https://www.researchgate.net/publication/20826647_Dose-dependent_pharmacokinetics_of_caffeine_in_humans_Relevance_as_a_test_of_quantitative_liver_function

The report cites human evidence that clearance can decline and observed half-life can rise at larger doses. It nevertheless recommends keeping first-order elimination as the consumer default because a universal `Km` / `Vmax` parameter set is not established.

## Two-compartment / richer PK models

- Two-compartment / caffeine PK source: https://pubmed.ncbi.nlm.nih.gov/23996078/
- CYP1A2 phenotyping / richer model source: https://pubmed.ncbi.nlm.nih.gov/20859793/

These are among the sources supporting the report's conclusion that richer compartmental models can fit detailed datasets but are generally overparameterized for an ordinary dose-and-time calculator.

## Habitual caffeine / repeated exposure context

- Wiley source cited in the report: https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1440-1681.1988.tb01003.x?sid=nlm%3Apubmed

## Pregnancy

- Pregnancy-related caffeine pharmacokinetics: https://pubmed.ncbi.nlm.nih.gov/6954898/
- Later pregnancy / caffeine metabolism source: https://pubmed.ncbi.nlm.nih.gov/22725721/

The report uses pregnancy literature to support treating late pregnancy as a distinct slower-clearance scenario rather than a small adjustment to the 5-hour adult default.

## Estrogen-containing oral contraceptives

- Oral contraceptive / caffeine half-life source: https://pubmed.ncbi.nlm.nih.gov/4029248/

The report cites a representative mean half-life around 7.88 h in oral-contraceptive users versus about 5.37 h in controls.

## Age / adult variability

- Age-related caffeine pharmacokinetics source: https://pubmed.ncbi.nlm.nih.gov/6886969/

The report concludes that healthy adult age alone should not automatically change the half-life because ordinary person-to-person variability can be larger than the average age effect.

## Liver disease / hepatic impairment

- Caffeine elimination in liver disease source: https://pmc.ncbi.nlm.nih.gov/articles/PMC1545746/
- Additional hepatic impairment / caffeine source: https://pubmed.ncbi.nlm.nih.gov/9156694/
- Additional cirrhosis / caffeine PK source: https://pmc.ncbi.nlm.nih.gov/articles/PMC1379781/

The report does not recommend a single generic liver-disease multiplier because severity and observed half-life vary substantially.

## Smoking cessation / covariate interaction

- Smoking cessation / caffeine clearance source: https://pubmed.ncbi.nlm.nih.gov/17370067/

## Caffeine metabolites / comparative pharmacokinetics

- Flinders research record on caffeine and primary demethylated metabolites: https://researchnow.flinders.edu.au/en/publications/comparative-pharmacokinetics-of-caffeine-and-its-primary-demethyl/

This supports the report's caution that a parent-caffeine calculator should not describe eliminated parent caffeine as if all pharmacologically relevant methylxanthines have disappeared.

## Pregnancy PBPK / mechanistic modelling

- PBPK-related caffeine source: https://pmc.ncbi.nlm.nih.gov/articles/PMC4898153/

## Broad review of factors affecting caffeine pharmacokinetics

- Frontiers in Pharmacology review: https://www.frontiersin.org/journals/pharmacology/articles/10.3389/fphar.2021.752826/full

The report uses the broader literature to emphasize large interindividual variability and the effects of smoking, pregnancy, hormones, hepatic function, drug interactions, dose, and CYP1A2 phenotype/context.

---

## How these sources are used in this repository

The app currently implements only the transparent first-order **parent caffeine remaining in mg** model plus sensitivity trajectories.

The sources above are **not** used as justification to claim individualized blood concentration. They are used to:

1. choose a simple structural model suitable for ordinary user inputs;
2. select 5 h as a nominal adult scenario;
3. show 3 h and 8 h as practical sensitivity scenarios rather than fake confidence limits;
4. document why individual half-life can differ substantially;
5. avoid unsupported genotype/covariate multipliers;
6. keep Bateman absorption, concentration estimates, nonlinear elimination, and multi-compartment PK as potential advanced/research modes rather than silently mixing them into the simple calculator.

When changing the mathematical model, verify the relevant claim in the primary paper rather than relying only on this source list.