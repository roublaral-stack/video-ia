# VIDEO IA — Plantes & Bulles

Premier Reel de démonstration : **15 s · 1080 × 1920 · 30 fps · 450 images**.

Le projet est isolé dans `reel/`. Aucun fichier des projets Brag ou Voix off n'est utilisé ou modifié.

## Chaîne de production automatisée

Une commande réutilise le générateur existant :

```bash
cd /workspace/video-ia/reel
npm run produce -- pipeline-config/demo.json --dry-run
npm run produce -- pipeline-config/demo.json
```

La configuration fournit le sujet, le modèle (`educatif`, `vlog`, `application`), la durée (15/30/60 s), les chemins des photos/vidéos et les paramètres de narration. Les chemins sont relatifs au JSON. Pour un vrai projet, copier un exemple dans `reel/private/ma-production.json` et y renseigner ses fichiers ; ce dossier est ignoré par Git. Les exemples avec chemins `../private/...` sont des emplacements à compléter, pas des fichiers supposés existants.

Étapes : **script → médias → voix → sous-titres → storyboard/scènes → Remotion/SnapCN → vérification → ZIP privé**. Le texte par défaut est préparé par des modèles déterministes, sans API LLM et sans recherche scientifique implicite. Fournir `narration.text` pour un script éditorial précis. Le sujet est repris dans un texte court, posé et neutre. Le plan décrit cette origine ; les scènes et leurs durées utilisent le `buildTimeline` existant. Les titres de production utilisent le vrai composant SnapCN `TextReveal` ; les anciens projets gardent leur animation par défaut.

### Intégrations réellement disponibles

| Module | Opérationnel ici | Limite |
|---|---|---|
| Remotion / SnapCN / Chromium | Oui, montage et MP4 vertical réel | Aucun téléchargement de navigateur nécessaire |
| Voix synthétique de démo | Oui, eSpeak-NG local français | Démo robotique, pas Chatterbox ni la voix de Corentin |
| Chatterbox | Dépôt/API audités, pont Python fourni | Runtime/poids absents, Hugging Face refusé par le proxy ; inférence non testée |
| Voix off par fichiers | Oui, audio + SRT importés | Le SRT importé reste à vérifier contre les paroles ; pas de forced alignment/ASR |
| Brag | Exports importables pour `application` uniquement | Skill Hyperframes, pas d'API de scènes documentée ; création du film Brag manuelle |

L'audit, les URL exactes et les commits amont sont dans [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md). Aucun dépôt Brag ou Chatterbox n'est modifié.

Configurations disponibles dans `reel/pipeline-config/` :

- `demo.json` : photos/vidéo et voix entièrement synthétiques, produits localement ; aucun rush personnel.
- `files.example.json` : narration et SRT exportés depuis le projet Voix off.
- `chatterbox.example.json` : activation conditionnelle du pont avec un Python déjà équipé. Pas d'installation automatique ni de modèle prétendument présent.
- `application-brag.example.json` : captures/MP4 Brag, facultatifs et réservés au modèle application. Brag n'intervient jamais dans un Reel éducatif ou Vlog.

### Alignement de la narration

La synthèse est effectuée **phrase par phrase**. Les WAV sont normalisés à 48 kHz ; leurs nombres d'échantillons déterminent les horodatages SRT, les silences et le WAV final. Cela donne un calage réel par phrase, pas un répartiteur arbitraire du texte dans la durée. Aucun alignement mot à mot ni vérification perceptive de la voix n'est revendiqué. Le rapport conserve la méthode utilisée.

La narration n'est pas coupée pour rentrer de force : si elle dépasse la durée disponible, le pipeline s'arrête avec un diagnostic. Réduire le texte, changer la durée ou ajuster les réglages de synthèse disponibles. `speed` règle seulement la voix de démo ; Chatterbox utilise ses paramètres vérifiés. Les WAV/SRT importés doivent rester dans la durée du Reel ; leur alignement lexical est sous la responsabilité de l'export source.

### Reprise et absence de doublons

Chaque production est enregistrée dans `reel/pipeline-runs/IDENTIFIANT/` :

- identifiant calculé sur la configuration, le contenu des entrées et le code/dépendances de la chaîne ;
- `state.json` atomique avec l'étape, ses tentatives et les empreintes des sorties ;
- verrou par processus pour empêcher deux exécutions simultanées ; récupération d'un verrou dont le processus est mort ;
- réutilisation des étapes terminées si leurs sorties sont intactes ; invalidation à partir d'une sortie absente/corrompue ;
- changement de configuration, d'entrée ou de code = nouvelle production, pour ne pas réutiliser un rendu incompatible.

Après interruption ou erreur, relancer **la même commande avec la même configuration**. Pour repartir explicitement d'une étape :

```bash
npm run produce -- private/ma-production.json --from render
```

Étapes reconnues : `plan`, `media`, `voice`, `captions`, `scenes`, `render`, `verify`, `archive`. Si un verrou est incomplet, le diagnostic demande de vérifier les processus avant toute suppression manuelle. Le dry-run lit et valide les entrées, calcule l'identifiant et affiche les étapes, mais ne crée aucune production, ne synthétise rien et ne télécharge aucun modèle.

Une injection de panne sert uniquement aux tests :

```bash
npm run produce -- pipeline-config/demo.json --fail-once captions
# Échec volontaire ; cette commande reprend sans refaire les étapes intactes :
npm run produce -- pipeline-config/demo.json
```

L'injection ne se produit qu'une fois pour cet identifiant. Une nouvelle exécution normale d'une production déjà terminée ne refait pas le rendu. `--from archive` permet de régénérer seulement l'archive et ses liens.

### Récupérer les fichiers privés

La commande affiche les chemins de `final.mp4`, `sources.zip`, `verification.json` et la page `/production/IDENTIFIANT`. Démarrer `npm run editor` puis ouvrir cette page **sur la machine cloud** : elle propose les téléchargements MP4 et ZIP. Les téléchargements exigent un jeton local, renvoient `Content-Disposition: attachment`, et ne sont pas mis en cache. Le service écoute seulement sur 127.0.0.1 ; aucune publication Internet n'est effectuée.

Le ZIP contient le projet rééditable, les médias normalisés, la narration du montage, le script, le storyboard, le SRT et le rapport. Il n'inclut ni échantillon de référence, poids de modèle, environnement, exécutable ou secret. C'est une archive locale privée, pas un ZIP chiffré. La restauration `npm run project -- restore ...` restaure le projet et ses médias ; les documents `production/` restent consultables dans le ZIP.

Sur iPhone, joindre les fichiers à Codex et demander la production. Demander ensuite à Codex les pièces jointes MP4/ZIP si l'interface le permet. Le serveur localhost n'est pas directement accessible depuis l'iPhone ; aucun lien public de release n'est créé sans autorisation. Les fichiers restent récupérables dans le workspace ou via la page cloud autorisée. Les liens locaux et ZIP ont été testés par HTTP, pas sur un iPhone physique.

Exemple de demande : **« Dans VIDEO IA, fais un Reel éducatif de 30 secondes sur mes plantes avec ces photos. Utilise cet audio et son SRT, puis donne-moi le MP4 et le ZIP privés. »**

### Confidentialité et validation

Aucun rush, WAV, échantillon, transcript de production, configuration privée ou ZIP n'est ajouté à Git automatiquement. `pipeline-runs/`, `private/`, `projects/`, `public/uploads/`, `voice-samples/`, les nouveaux fichiers audio/vidéo et les fichiers `*.private.json`/`*.local.json` sont ignorés. Les anciennes démos silencieuses déjà versionnées sont conservées. Le pipeline ne contient aucune commande de commit, push, upload ou publication.

Les vérifications contrôlent H.264, 1080 × 1920, 30 fps, durée et images attendues, piste AAC, décodage complet, niveau audio non nul, décalage entre l'audio source et l'audio du MP4, concordance SRT/montage et présence de signal sur chaque plage sous-titrée. Elles ne remplacent pas une écoute éditoriale ou une reconnaissance des mots prononcés.

`npm test` conserve les tests antérieurs et ajoute le dry-run, les configurations des adaptateurs, les verrous, une panne suivie de reprise, un nouvel appel sans réexport, une corruption ZIP réparée sans refaire la voix/le MP4, la restauration et les téléchargements privés. Les fixtures sont toutes synthétiques.


### Résultats de cette évolution

Suite complète : **26 tests réussis, aucun échec ni test ignoré**, complétée par les contrôles ciblés des adaptateurs Brag. TypeScript valide. La démo de production de 15 s a été exportée en 1080 × 1920 à 30 fps (450 images), H.264 avec piste AAC, puis décodée entièrement. Le signal audio est non nul ; son début détecté est identique dans la source et le MP4 (0,50 s). Les quatre sous-titres suivent les frontières des phrases synthétisées. Des images représentatives ont été inspectées.

Échec injecté avant `captions`, puis reprise : une seule exécution de `plan`, `media`, `voice` et `render`, deux tentatives de `captions`. Le test répare aussi un ZIP corrompu sans refaire le MP4, restaure son projet et vérifie les téléchargements MP4/ZIP par leurs empreintes. Aucun enregistrement personnel n'a servi à ces essais. La voix Chatterbox reste non testée en inférence : le pont retourne explicitement l'absence de son runtime.

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
