# Third-party notices

## instagram-agent-skill

Hook formulas, caption linting, and humanizer logic are adapted from:

- Repository: https://github.com/Jakeschincariol/instagram-agent-skill
- License: MIT (Copyright (c) 2026 Jake Schincariol)
- Local audit copy: `_vendor/instagram-agent-skill/` (gitignored; clone for reference)

Planned adaptation per `docs/DECISIONS.md` DEC-009.

## claude-seo

SEO and GEO audit criteria and agent instructions (`apps/web/server/seo/checks.ts`,
`apps/web/server/agents/prompts/seo-geo.ts`) are adapted from:

- Repository: https://github.com/AgriciDaniel/claude-seo (v1.8)
- License: MIT (Copyright (c) 2026 agricidaniel)

## Reel scriptwriter, director and scene routing (apps/web/server/reels)

Short-form structure, hook types and model-choice/prompting rules are adapted (rewritten, not copied) from these MIT-licensed agent skills:

- kostja94/marketing-skills `video-marketing` — https://github.com/kostja94/marketing-skills (MIT)
- coreyhaines31/marketingskills `copywriting` (AI-tell rules) — https://github.com/coreyhaines31/marketingskills (MIT)
- higgsfield-ai/skills `higgsfield-generate` (model catalog, prompt guide) — https://github.com/higgsfield-ai/skills (MIT)
- dexhunter/seedance2-skill `seedance-prompt-en` — https://github.com/dexhunter/seedance2-skill (MIT)
- blacktwist/social-media-skills `content-strategy-sms` (content pillars) — https://github.com/blacktwist/social-media-skills (MIT)

minimax-ai/minimax-h3 `h3-prompt-writing` was read for reference only (no licence published); none of its text is used.
