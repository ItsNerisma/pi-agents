# AGENTS.md — Conventions du dépôt pi-agents

## Commits

Format mixte **gitmoji + Conventional Commits**. Les deux styles cohabitent, le
choix est libre. Exemples observés :

```
✨ feat(delegate): progressive transcript with resolved tool markers
🐛 fix: migrate delegate to ModelRuntime for pi >= 0.80.8
♻️ refactor(runner): structured tool call entries, prevent overwrites
📝 docs: explain opt-in design — declare only what the agent needs
🎨 Bannière ASCII centrée avec tagline
🔥 Remove unused outputFormat field
```

Les emojis fréquents :

| Emoji | Usage |
|-------|-------|
| ✨ | Nouvelle fonctionnalité |
| 🐛 | Correction de bug |
| 🔖 | Bump de version |
| ♻️ | Refactoring (pas de changement fonctionnel) |
| 📝 | Documentation (README, commentaires) |
| 🎨 | Format, structure, style |
| 🔥 | Suppression de code |
| 🌐 | Internationalisation |

Un commit = un changement cohérent. Le sujet est en anglais ou en français, à
l'impératif, concis. Le body optionnel explique le pourquoi.

## Versionnement

Le projet suit [SemVer](https://semver.org). Version actuelle dans
`package.json` et en tête de `CHANGELOG.md`.

### Critères de bump

| Bump | Quand |
|------|-------|
| **PATCH** (`1.2.3 → 1.2.4`) | Bug fix sans changement d'API. Correction d'un comportement cassé, typo critique. |
| **MINOR** (`1.2.0 → 1.3.0`) | Nouvelle fonctionnalité rétrocompatible. Nouvel agent, nouvelle option de frontmatter, nouvel outil. |
| **MAJOR** (`1.0.0 → 2.0.0`) | Breaking change. Suppression d'un champ d'API public, changement de comportement par défaut, montée de peerDependency majeure. |

En cas d'incertitude, prendre le bump le plus bas qui couvre le changement le
plus impactant.

### Procédure de release

1. Mettre à jour la version dans `package.json`.
2. Ajouter l'entrée correspondante en tête de `CHANGELOG.md` (format [Keep a
   Changelog](https://keepachangelog.com/en/1.1.0/)).
3. Committer avec `🔖` : `🔖 X.Y.Z` (ou `Bump version to X.Y.Z`).
4. Optionnel : tagger avec `git tag vX.Y.Z`.

## Changelog

Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Sections :

- `### Added` — nouvelles fonctionnalités
- `### Changed` — modifications de comportement existant
- `### Fixed` — corrections de bugs
- `### Removed` — fonctionnalités supprimées

Chaque entrée est une phrase en anglais ou en français, à l'infinitif ou au
passé. Les sous-listes utilisent `-`.

Ne pas regrouper des changements de natures différentes sous la même entrée.
Chaque ligne = un changement distinct.

## Validations avant commit

- `npm run typecheck` doit passer (`tsc --noEmit`)
- `npm test` doit passer (suite de tests Node)
- Le diff ne contient que les changements intentionnels
