# VIDEO IA — Plantes & Bulles

Premier Reel de démonstration : **15 s · 1080 × 1920 · 30 fps · 450 images**.

Le projet est isolé dans `reel/`. Aucun fichier des projets Brag ou Voix off n'est utilisé ou modifié.

## Démarrer

Node 24 a été utilisé ; Python 3, FFmpeg et ffprobe sont nécessaires pour l'export de secours.

```bash
cd /workspace/video-ia/reel
npm_config_cache=/workspace/.npm-cache npm ci --no-audit --no-fund
npm run typecheck
npm run studio -- --port=3000
```

Le Studio répond localement. Composition : `PlantesBulles`. Modèle React réutilisable : `src/Reel.tsx` ; dimensions, durée et marque par défaut : `src/Root.tsx`. La marque est modifiable par les props. Les trois scènes et leurs transitions ont leur propre entrée dans la timeline. Le titre utilise le vrai composant SnapCN TextReveal, pas une imitation.

## Export Remotion validé

Chromium **156.0.8078.79** est déjà disponible dans cet environnement à `/usr/bin/chromium`. Le rendu a réellement été effectué avec Remotion **4.0.543**, la composition `PlantesBulles` et le composant SnapCN `TextReveal`, sans télécharger de navigateur.

```bash
cd /workspace/video-ia/reel
npm run typecheck
npm run render:cloud
bash scripts/verify-video.sh
bash scripts/contact-sheet.sh
```

`render:cloud` exécute :

```bash
remotion render src/index.ts PlantesBulles out/plantes-bulles-remotion.mp4 --concurrency=2 --is-production=false --browser-executable=/usr/bin/chromium
```

Contrôles exécutés : H.264, 1080 × 1920, 30 fps, 450 images, durée exacte 15,000 secondes ; décodage intégral FFmpeg sans erreur. Images extraites à 0, 1, 3, 5, 7, 10, 12 et 14 secondes ; scènes contrôlées visuellement à 3, 7 et 12 secondes. Export silencieux. L'aperçu interactif Studio n'a pas été testé dans un navigateur partagé ; cela n'empêche pas le rendu headless vérifié.

Sur une autre machine avec un navigateur à un autre emplacement, utiliser `npm run render -- --browser-executable=/chemin/vers/chromium`. Si aucun navigateur n'est installé, `npx remotion browser ensure` puis `npm run render` utilisent le navigateur Remotion. Le téléchargement était bloqué dans cette instance (`EAI_AGAIN remotion.media`, HTTP 403 via le proxy), mais ce téléchargement est désormais inutile ici. Les domaines `remotion.media`, `www.remotion.dev` et `snapcn.dev` restent déclarés dans le brouillon cloud ; aucun changement réseau courant n'a été nécessaire à l'export réussi.

## Récupérer le MP4 sur iPhone

Le rendu Remotion final est archivé dans `deliverables/plantes-bulles-remotion.mp4` (environ 8,2 Mo), avec sa somme SHA-256. Ce dossier contient un livrable final volontairement versionné, et non les fichiers temporaires de rendu.

Après le push sur `main`, ouvrir :

https://github.com/roublaral-stack/video-ia/raw/refs/heads/main/deliverables/plantes-bulles-remotion.mp4

Si le dépôt est privé, se connecter à GitHub avec le compte autorisé. Sur iPhone, ouvrir le lien dans Safari, puis utiliser Partager → Enregistrer dans Fichiers ; l'import dans Photos dépend des options proposées par iOS. Le téléchargement n'a pas été testé sur un iPhone physique. La récupération peut aussi se faire depuis la page du fichier dans GitHub via le bouton de téléchargement.

La création de release n'a pas été effectuée : l'appel de lecture `gh api repos/roublaral-stack/video-ia` renvoie `Forbidden`. Aucun jeton supplémentaire n'est demandé. Le dépôt Git reste une voie distincte, testée lors du push. Le répertoire d'artefacts `/mnt/data` n'est pas accessible en écriture dans cette instance ; le fichier final versionné permet une récupération durable.

## Export de secours distinct — Pillow + FFmpeg

`reel/out/plantes-bulles-demo.mp4` est un **export de secours Pillow + FFmpeg** : il reprend le storyboard avec ses propres animations déterministes. Il ne constitue pas une validation du rendu SnapCN. La composition Remotion est conservée séparément ; les deux moteurs ne produisent pas une vidéo identique. Le Reel est silencieux, avec poissons et bulles animés, titres entrants et fondus entre trois séquences.

```bash
cd /workspace/video-ia/reel
python3 -m venv .venv
.venv/bin/python -m pip install --cache-dir /workspace/.pip-cache -r requirements-render.txt
.venv/bin/python scripts/render-fallback.py
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,nb_frames -of json out/plantes-bulles-demo.mp4
```

Storyboard : 0–5 s « Un monde vivant » ; 5–10 s « Le calme pousse » ; 10–15 s « Plantes & Bulles », avec transitions de 0,5 s. Les transitions chevauchent les scènes. Tous les visuels sont des illustrations originales de substitution clairement indiquées. Sources et licences : `reel/THIRD_PARTY.md`.

## À enregistrer dans GitHub

Enregistrer **README.md, skills-lock.json, .agents/skills/ et tout `reel/` hors fichiers ignorés**. Cela inclut les sources React, le composant SnapCN et sa licence, les scripts, package.json, package-lock.json, tsconfig.json, requirements-render.txt, la police et ses licences, ainsi que `.gitignore`.

Ne pas enregistrer node_modules/, .venv/, build/, out/ ni les secrets. Le seul MP4 versionné est le rendu Remotion final dans `deliverables/`, accompagné de SHA256SUMS. Le MP4 de secours reste dans `reel/out/plantes-bulles-demo.mp4` et se régénère avec son propre script.

Les sources, skills, configurations et le livrable final sont préparés pour un commit initial et un push sur `main`. Vérifier `git log -1` et `git status -sb` pour retrouver le commit effectivement enregistré ; le compte rendu de la tâche confirme séparément le résultat du push. Un projet cloud étant déjà isolé, réutiliser ce checkout ; aucun worktree supplémentaire nécessaire.
