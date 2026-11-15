# VIDEO IA — Plantes & Bulles

Premier Reel de démonstration : **15 s · 1080 × 1920 · 30 fps · 450 images**.

Le projet est isolé dans `reel/`. Aucun fichier des projets Brag ou Voix off n'est utilisé ou modifié.

## Générateur de Reels réutilisable

La composition originale **PlantesBulles** est conservée. **ReelGenerator** est la nouvelle composition pilotée par un projet JSON. Elle accepte :

- un sujet et les modèles `educatif`, `vlog`, `application` ;
- une durée de **15, 30 ou 60 secondes** à 30 fps, toujours en 1080 × 1920 à l'export normal ;
- plusieurs photos et vidéos, des titres personnalisés et une piste audio avec volume, découpe de départ, décalage et répétition optionnelle ;
- des sous-titres horodatés, un SRT, ou un premier calage proposé à partir d'un texte écrit, ajustable ensuite.

Les coupes et fondus sont calculés automatiquement ; chaque média est utilisé dans l'ordre d'import. Les plans supplémentaires réutilisent les médias si nécessaire. La durée tient compte du chevauchement des fondus. Les vidéos courtes bouclent pour couvrir leur plan et leur son original est coupé ; seule la piste audio choisie est entendue. Les photos reçoivent un léger mouvement de caméra. Sans médias, les illustrations originales restent identifiées comme substitutions. Les modèles donnent un déroulé : question/observation/à retenir, journée/coulisses/détail, besoin/démonstration/découverte. Ils n'inventent ni faits scientifiques ni fonctionnalités de l'application.

Les sous-titres écrits sont répartis approximativement : **aucune transcription ou synchronisation vocale automatique**. Les champs `start` et `end` sont en secondes ; `captionOffset` positif retarde leur affichage. Le SRT accepte les millisecondes. Les horodatages inversés, chevauchants ou hors durée sont refusés. Les titres d'une scène disparaissent avant ceux de la suivante, y compris dans la composition originale autour de 10 s.

### Depuis Codex sur iPhone

1. Joindre vos photos/vidéos et votre piste audio dans la conversation Codex. Indiquer le sujet, le modèle, 15/30/60 s et les textes souhaités. Pour les photos HEIC, exporter en JPEG depuis Photos/Fichiers.
2. Demander par exemple : « Dans VIDEO IA, crée un Vlog de 30 secondes avec ces trois vidéos et cette musique, dans cet ordre. Utilise ces titres : … Ne publie pas les médias personnels. » Codex prépare le projet et exécute les commandes ci-dessous.
3. Fournir un SRT ou un commentaire écrit. Demander le calage des sous-titres, écouter le résultat et communiquer les décalages souhaités. Un texte seul ne permet pas de vérifier le rythme réel de la parole.
4. Demander l'export Remotion et la vérification `ffprobe`. Télécharger la pièce jointe si votre interface Codex la prend en charge. Sinon, pour un lien durable comme celui de cette démo, demander explicitement d'archiver **le MP4 final seulement** dans `deliverables/` et de le pousser sur GitHub. Sur iPhone : ouvrir le lien GitHub dans Safari → Partager → Enregistrer dans Fichiers.
5. Pour reprendre un projet personnel dans une autre tâche, télécharger son **archive ZIP portable**, puis la joindre à la nouvelle conversation. Le JSON seul ne contient pas les médias. Les sources du générateur sont sur GitHub, les imports personnels et projets de travail sont ignorés par défaut.

Aucun test sur un iPhone physique n'est revendiqué. L'interface a un format mobile, mais son adresse `127.0.0.1` appartient à la machine cloud : elle n'est pas une adresse accessible directement depuis l'iPhone. Le workflow par pièces jointes et commandes Codex fonctionne sans exposer un serveur public.

### Commandes reproductibles

Node **24** est requis pour exécuter le modèle TypeScript partagé depuis les scripts. Installer :

```bash
cd /workspace/video-ia/reel
npm_config_cache=/workspace/.npm-cache npm ci --no-audit --no-fund
npm run project -- init projects/mon-reel.json vlog 30 "Une journée avec mes plantes"
npm run project -- import projects/mon-reel.json /chemin/photo.jpg /chemin/video.mov /chemin/musique.m4a
```

Modifier les `titles` dans le JSON. Pour un premier calage à partir d'un fichier texte, ou un SRT déjà synchronisé :

```bash
npm run project -- captions projects/mon-reel.json /chemin/commentaire.txt
# Alternative : remplacer les sous-titres par le SRT, décalage facultatif +0,25 s
npm run project -- srt projects/mon-reel.json /chemin/sous-titres.srt 0.25
npm run project -- check projects/mon-reel.json
npm run project -- render projects/mon-reel.json out/mon-reel.mp4
bash scripts/verify-video.sh out/mon-reel.mp4
bash scripts/contact-sheet.sh out/mon-reel.mp4
```

`REMOTION_BROWSER_EXECUTABLE` permet de remplacer `/usr/bin/chromium` pour le générateur. Les exports sont de vrais rendus Remotion, pas le moteur de secours. `examples/` contient trois projets sans médias externes. Pour les adapter, les copier dans `projects/`.

Sauvegarder et restaurer les médias avec le projet :

```bash
npm run project -- pack projects/mon-reel.json out/mon-reel-projet.zip
# Dans une prochaine tâche : refuse d'écraser un projet existant
npm run project -- restore projects/repris.json /chemin/mon-reel-projet.zip
```

Ne pas publier une archive personnelle dans GitHub sans l'avoir décidé. Le ZIP contient `project.json` et les médias normalisés dans `public/uploads/`. Le projet JSON reste éditable : `media[].trimStart`, `media[].fit` (`cover` ou `contain`), `audio.trimStart`, `audio.from`, `audio.volume` et `audio.loop`. `cover` recadre, `contain` préserve l'intégralité avec des marges.

### Interface d'import et d'export

```bash
cd /workspace/video-ia/reel
npm run editor
```

L'atelier écoute uniquement sur `127.0.0.1:3210` (variable `PORT` pour changer). On peut y importer plusieurs médias, choisir un modèle et la durée, saisir les titres, importer une piste audio et un SRT, proposer/ajuster les sous-titres, construire la timeline puis exporter/télécharger le MP4. Le téléchargement JSON permet de reprendre les réglages sur la même machine ; conserver le ZIP pour changer de machine. Pour une prévisualisation à la frame et des réglages avancés, ouvrir Remotion Studio avec les props du projet :

```bash
npm run studio -- --props=projects/render-IDENTIFIANT.json
```

Les fichiers `render-*.json` sont créés lors d'un export et contiennent l'enveloppe `{ "project": ... }` attendue par Studio. Ils ne sont pas versionnés. Dans Studio, choisir **ReelGenerator** ; **PlantesBulles** reste disponible séparément.

Formats : JPEG/PNG/WebP ; MP4/MOV/M4V/WebM/MKV ; MP3/WAV/M4A/AAC/OGG/FLAC. Import plafonné à 500 Mo et 10 minutes par fichier. FFmpeg normalise les vidéos en H.264 30 fps sans leur son, les images en JPEG, et l'audio en WAV ; les métadonnées sont retirées. Conserver les originaux ailleurs. HEIC et URL distantes non pris en charge. Compter au moins 2 secondes par média et 1 seconde par sous-titre proposé ; sinon choisir une durée supérieure ou réduire le nombre de médias. L'export n'est pas une publication sur un réseau social.

### Tests

```bash
cd /workspace/video-ia/reel
npm run typecheck
npm test
```

Les tests de modèle couvrent la durée exacte, les trois modèles, l'utilisation des médias, les gardes des titres, le SRT, les horodatages, les paramètres audio et le refus des chemins/URL invalides. Le test navigateur utilise **Chromium système**, un viewport mobile, une photo, une vidéo MOV, un audio et un SRT synthétiques ; il réalise un véritable export MP4 puis le télécharge, vérifie vidéo + audio et décode le fichier. Les fixtures, captures et exports de test restent dans `out/` et ne sont pas des médias personnels.


### Validation réalisée

- 17 tests du modèle et 1 test navigateur complet réussis ; contrôle TypeScript réussi.
- Import JPEG + MOV + WAV, import SRT et décalage de 0,25 s, export et téléchargement depuis une interface de 390 × 844 pixels testés.
- Exports Remotion **15 s en 1080 × 1920**, **30 s et 60 s en 270 × 480 pour les tests** ; nombres d'images respectifs 450, 900 et 1800. L'export normal de chaque durée reste en 1080 × 1920. Vidéo H.264 et audio AAC vérifiés, décodage complet réussi.
- La piste AAC peut ajouter environ 19 ms au conteneur MP4 ; la piste vidéo respecte exactement la durée choisie. Le vérificateur accepte moins de 50 ms d'écart de conteneur et contrôle la durée et le nombre exact d'images vidéo.
- Sauvegarde/restauration ZIP avec les médias testée ; fichiers manquants, chemins invalides et type de média incompatible refusés.
- Le Reel original a été réexporté après la correction des textes autour de 10 s ; le moteur Pillow + FFmpeg de secours est conservé séparément.

Démo du nouveau générateur (illustrations uniquement, aucun média personnel) :

https://github.com/roublaral-stack/video-ia/raw/refs/heads/main/deliverables/plantes-bulles-generateur-demo.mp4

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

Ne pas enregistrer node_modules/, .venv/, build/, out/, projects/, public/uploads/ ni les secrets. Les MP4 versionnés dans `deliverables/` sont le Reel original corrigé et la démo du nouveau générateur, accompagnés de SHA256SUMS. Le MP4 de secours reste dans `reel/out/plantes-bulles-demo.mp4` et se régénère avec son propre script.

Les sources, skills, configurations et livrables finaux sont enregistrés sur `main`. Vérifier `git log -1` et `git status -sb` pour retrouver le commit effectivement enregistré ; le compte rendu de la tâche confirme séparément le résultat du push. Un projet cloud étant déjà isolé, réutiliser ce checkout ; aucun worktree supplémentaire nécessaire.
