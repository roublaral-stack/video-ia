# VIDEO IA — Plantes & Bulles

Générateur de Reels verticaux de **15, 30 ou 60 secondes**. La production passe par un **vrai aperçu Remotion**, puis une validation créative explicite avant l’export HD. Les tests techniques ne donnent pas cet accord.

Le code reste dans `reel/`. La composition originale `PlantesBulles`, SnapCN, les imports, les modèles Éducatif/Vlog/Application, l’atelier, le SRT et les archives sont conservés. Les dépôts Brag et Voix off ne sont pas modifiés.

## Installer et vérifier

Node **24**, Python 3, FFmpeg/ffprobe et Chromium sont nécessaires. Dans cet environnement, Chromium est installé à `/usr/bin/chromium` ; aucun téléchargement de navigateur n’est nécessaire.

```bash
cd /workspace/video-ia/reel
npm_config_cache=/workspace/.npm-cache npm ci --no-audit --no-fund
python3 -m venv .venv
.venv/bin/python -m pip install --cache-dir /workspace/.pip-cache -r requirements-render.txt
npm run setup:alignment
npm run typecheck
npm test
```

`setup:alignment` installe PocketSphinx et son modèle français local, pas un moteur vocal. GCC/G++ sont nécessaires si PocketSphinx doit être compilé. Les versions sont figées dans les manifests, requirements et `scripts/alignment-model.lock.json`. La machine cloud n’envoie aucun audio à un service de transcription.

## Production depuis Codex sur iPhone

1. Joindre les photos/vidéos, le WAV exporté par votre projet Chatterbox et son SRT à Codex. Les placer dans `reel/private/mon-reel/`, jamais dans les sources versionnées.
2. Demander le sujet, le modèle et la durée, ainsi qu’une intention précise. Codex adapte `pipeline-config/files.example.json` dans un fichier privé. Les chemins sont relatifs au JSON.
3. Générer l’aperçu, regarder le MP4 et écouter la voix. Donner un avis sur l’accroche, les images, les coupes, les sous-titres et la fin.
4. Après accord explicite sur cet aperçu, demander l’export HD et les fichiers privés. Une correction des sources ou du rendu exige un nouvel aperçu.

Exemple de demande : **« Fais un aperçu Vlog de 15 secondes avec ces plans, mon WAV Chatterbox et son SRT. Garde ma voix intacte. Montre-moi le résultat avant la HD. »**

```bash
cd /workspace/video-ia/reel
# Copier l’exemple, puis adapter les chemins et le brief.
cp pipeline-config/files.example.json private/mon-reel.private.json
npm run produce -- private/mon-reel.private.json --dry-run
npm run produce -- private/mon-reel.private.json
# Résultat attendu : awaiting_review, preview.mp4, images extraites, note créative.

# Seulement APRÈS visionnage et accord explicite :
npm run produce -- private/mon-reel.private.json \
  --approve-preview EMPREINTE_RETOURNEE \
  --review-note "Mon avis explicite après visionnage et écoute."
```

La commande de production calcule le script depuis le SRT du WAV, importe les médias, aligne les sous-titres, construit le montage, rend un aperçu **720 × 1280 à 30 fps**, le décode et extrait des images représentatives. Elle s’arrête alors. L’accord lie les octets de l’aperçu, le projet et les médias. Sans accord valide, aucun MP4 HD ni export final n’est lancé. Après accord : rendu Remotion **1080 × 1920**, vérification ffprobe/décodage/audio, puis ZIP privé.

Pour consulter la revue locale : `npm run editor`, puis `/production/IDENTIFIANT`. Cette page montre le vrai MP4, les images extraites, l’intention, les limites et un formulaire de validation. Les téléchargements exigent un jeton local ; cache désactivé, requêtes partielles vidéo prises en charge. Le serveur écoute seulement sur `127.0.0.1`.

**Sur iPhone, localhost n’est pas une adresse Internet.** Demander à Codex les liens de fichiers du workspace ; utiliser « Enregistrer sous… » si le client le propose. Les outils de cette session ne fournissent pas d’hébergement privé externe ni de création de pièce jointe sortante. Aucun test sur un iPhone physique n’est revendiqué. Un ZIP privé permet de transférer le projet sur une autre machine ; GitHub conserve seulement le générateur, pas vos fichiers.

## Démonstration et production

| Mode | Voix et médias | Export |
|---|---|---|
| `mode: demo` | eSpeak-NG et médias de test explicitement identifiés possibles | Ancien parcours de démonstration, sans valeur de validation créative |
| `mode: production` | WAV réel ou runtime Chatterbox explicitement fourni ; médias réels, ou habillage typographique choisi | Aperçu obligatoire, accord explicite, puis HD |

La production est le défaut d’une nouvelle configuration. `demo: true` reste compatible avec les anciennes démos, mais sa combinaison avec `mode: production` est refusée. Une voix de démonstration, des ressources absentes ou un SRT non vérifié bloquent la production. Les exceptions `exceptions.demoVoice` et `exceptions.illustrations` exigent une demande explicite et une raison ; elles ne sont jamais activées pour résoudre une panne.

```bash
npm run produce:demo -- pipeline-config/demo.json --dry-run
npm run produce:demo -- pipeline-config/demo.json
```

La composition de démonstration illustrée reste disponible. Elle ne représente pas des rushs authentiques de plantes ou de poissons.

## Voix importée et sous-titres

`narration.engine: files` utilise **exclusivement** les fichiers `audio` et `srt`. `origin: chatterbox-export` indique l’origine déclarée par l’utilisateur, sans prétendre exécuter Chatterbox. Aucune substitution eSpeak/Kokoro, aucun clonage ni réécriture de l’enregistrement.

L’import conserve le WAV original. La piste du montage est protégée : gain 1, départ 0, sans découpe, boucle, fondu, changement de hauteur ou de vitesse. Le format de travail est PCM 48 kHz. Remotion crée réellement la vidéo ; FFmpeg copie son flux vidéo et encode directement la voix en AAC 256 kbit/s, ce qui évite l’atténuation introduite par le mixeur. L’AAC est avec perte : le MP4 n’est pas identique octet pour octet au WAV.

`preview-voice-integrity.json` et `voice-integrity.json` mesurent l’empreinte du WAV, l’identité du PCM de travail, la corrélation, le gain, le décalage et la présence de la voix sur toute sa durée. Un remplacement, une coupure ou l’ancienne baisse de 3 dB font échouer les contrôles. Ils ne remplacent pas une écoute perceptive.

Deux possibilités de calage :

- `alignment.mode: acoustic` : PocketSphinx aligne **le transcript fourni sur le signal réel**, mot à mot, puis produit des groupes courts (5 mots / 34 caractères visés) en respectant les pauses. Le rapport conserve les limites et les timings. Ce n’est pas une reconnaissance indépendante garantissant le contenu du transcript. Un mot inconnu demande une prononciation française vérifiée dans le dictionnaire local ; aucune estimation générique n’est inventée.
- `alignment.mode: srt`, `reviewed: true` : conserve un SRT déjà vérifié contre cette voix. Ce drapeau représente une vérification réelle, pas une manière de contourner l’aligneur. La production refuse les groupes supérieurs à 7 mots ou 52 caractères.

Le modèle CMU fr-5.2 vient de `synesthesiam/fr_pocketsphinx-cmu`, commit `b41b212857ad7afe1b2efa8aee8dae580ebb9c34`, avec empreintes et licence conservées. `.alignment/` reste local. `pipeline-config/import-editorial.example.json` propose un habillage uniquement typographique pour évaluer la voix en attendant les rushs.

## Direction créative réutilisable

`visualStyle: cinematic` utilise des photographies ou vidéos réelles plein cadre, des cuts placés sur les groupes parlés, des zooms modérés (3,5 % par défaut, limite 8 %), une accroche éditoriale unique et une signature finale. Les sous-titres sont sobres et restent dans une zone de lecture adaptée au téléphone. Les titres de plans ne se superposent pas autour de 10 secondes. La direction cinématique utilise des animations Remotion discrètes ; elle ne prétend pas utiliser SnapCN pour chaque texte. Le composant SnapCN original et le style `nature` sont conservés.

Le bloc `creative` contient `hook`, `intention`, `limitations`, `credits` et éventuellement `shots`. Chaque plan indique `start`, `end`, `mediaIndex`, `focusX`, `focusY`, `zoomFrom`, `zoomTo` et `transition: cut|fade`. Les plans doivent couvrir tout le Reel sans trou. Un plan vidéo trop court est refusé plutôt que bouclé en production. Les recadrages demandent une inspection visuelle ; une définition suffisante ne garantit pas un bon cadrage.

La production n’écrit plus de paragraphes génériques pour remplir la durée. Un WAV importé conserve ses paroles : améliorer son accroche orale exige un nouveau script et un nouvel export vocal. Pour une future synthèse native, un script validé est obligatoire et un enregistrement trop court ou long provoque un arrêt, sans allongement artificiel par des silences.

| Modèle | Brief à préparer avant l’audio |
|---|---|
| Éducatif | Un détail visible, une explication exacte et un geste ou repère utile. Pas de fait inventé pour accompagner une image. |
| Vlog | Un moment réel, le détail observé, une conclusion personnelle brève. Respirations naturelles. |
| Application | Un besoin précis, une démonstration visible, une invitation utile. Brag facultatif. |

La revue demande de juger réellement l’accroche, la correspondance paroles/images, les cadrages, le rythme, les sous-titres et le son. Elle peut rester **non validée même avec tous les contrôles techniques au vert**.

## Reprendre après une panne

L’identifiant dépend de la configuration, des empreintes des médias, du modèle d’alignement et des sources du générateur. `pipeline-runs/IDENTIFIANT/state.json` conserve étapes, tentatives, erreurs et empreintes. Un verrou empêche les doublons. Relancer la même commande réutilise les étapes intactes ; une sortie corrompue invalide les étapes qui en dépendent.

```bash
npm run produce -- private/mon-reel.private.json
# Refaire volontairement l’aperçu ; un rendu différent invalide son accord :
npm run produce -- private/mon-reel.private.json --from preview
# Panne de test, jamais nécessaire en usage normal :
npm run produce -- private/mon-reel.private.json --fail-once captions
```

Une nouvelle version des sources peut donner un nouvel identifiant ; la production antérieure reste conservée. Les diagnostics indiquent l’étape et la commande de reprise. Une validation avec la mauvaise empreinte laisse le projet en attente de revue.

## Intégrations réellement disponibles

| Composant | État |
|---|---|
| Remotion / Chromium système | Rendus réels, aperçu puis HD après accord |
| SnapCN | Composant MIT installé et conservé dans la composition originale et le générateur classique |
| Export Chatterbox par fichiers | Import privé WAV + SRT opérationnel ; voix préservée et contrôlée |
| Runtime Chatterbox natif | Adaptateur conditionnel documenté ; runtime, poids et référence personnels non disponibles ici, inférence non validée |
| Brag | Imports de captures/MP4 seulement, facultatifs pour Application ; aucune API directe supposée |

Voir [l’audit des intégrations](docs/INTEGRATIONS.md) et [la revue créative de cette évolution](docs/CREATIVE_REVIEW.md). Aucun chemin de runtime personnel n’est inventé. `chatterbox.example.json` est un exemple à renseigner, pas une installation fonctionnelle.

## Atelier et fonctions conservées

L’atelier manuel existe toujours (`npm run editor`). Il permet l’import de plusieurs médias, les trois modèles, les durées, les titres, l’audio, le SRT, la timeline, l’export et le ZIP. Son parcours historique de sous-titrage écrit propose des timings approximatifs ; **ce parcours manuel n’est pas la nouvelle chaîne de production avec revue obligatoire**. Utiliser `produce` pour cette dernière.

```bash
npm run project -- init projects/mon-reel.json vlog 30 "Une journée avec mes plantes"
npm run project -- import projects/mon-reel.json /chemin/photo.jpg /chemin/video.mov /chemin/musique.m4a
npm run project -- srt projects/mon-reel.json /chemin/sous-titres.srt 0.25
npm run project -- check projects/mon-reel.json
npm run project -- render projects/mon-reel.json out/mon-reel.mp4
npm run project -- pack projects/mon-reel.json out/mon-reel-projet.zip
npm run project -- restore projects/repris.json /chemin/mon-reel-projet.zip
```

Le rendu direct d’un projet de production marqué `requiresCreativeApproval` bloque la HD sans son accord. `REMOTION_BROWSER_EXECUTABLE` peut remplacer le chemin système. JPEG/PNG/WebP, MP4/MOV/M4V/WebM/MKV et WAV/MP3/M4A/AAC/OGG/FLAC sont pris en charge ; pas de HEIC ni d’URL distante. Import limité à 500 Mo et 10 minutes par fichier. Le son des rushs est coupé pour conserver la piste choisie. Les originaux restent à sauvegarder séparément.

Pour les réglages avancés : `npm run studio -- --props=projects/render-IDENTIFIANT.json`, composition `ReelGenerator`. La composition originale illustrée `PlantesBulles` reste indépendante : `npm run render:cloud`. Le secours `npm run render:fallback` utilise Pillow/FFmpeg et des illustrations de démonstration ; ce n’est **pas** un rendu Remotion et il n’est jamais choisi automatiquement en production.

## Confidentialité, sauvegarde et tests

Versionner README, docs, skills, sources React, composants/licences, polices/licences, scripts, exemples génériques, tests et manifests/verrous. Ne jamais ajouter les rushs, WAV, références vocales, transcripts personnels, configs privées, modèles, caches, ZIP ou rendus personnels. `.gitignore` protège `private/`, `pipeline-runs/`, `public/uploads/`, `projects/`, `.alignment/`, `.venv/`, `node_modules/`, les nouveaux fichiers audio/vidéo et `*.private.json` / `*.local.json`. Une photo ou un SRT placé ailleurs doit être examiné avant tout ajout Git.

Le ZIP final privé contient le projet rééditable, les médias et la narration utilisés, le script, le storyboard, le SRT et le rapport technique. Il exclut les références vocales, poids, environnements et secrets. Il n’est pas chiffré et reste sur la machine cloud. Restaurer via `npm run project -- restore ...`. Sauvegarder ce ZIP et les originaux **en privé** pour retrouver une production dans une autre tâche ; le commit seul restaure le générateur.

`npm test` conserve les régressions du générateur et de l’atelier, et couvre le refus des substitutions, les ressources manquantes, les sous-titres, la fidélité audio, les validations périmées, les pannes/reprises, l’idempotence, un vrai aperçu, le blocage HD, l’accord explicite sur une fixture synthétique, le rendu HD, le ZIP et les téléchargements privés. Les tests automatisés ne valident jamais l’aperçu personnel de l’utilisateur. Les résultats précis et les limites créatives sont consignés dans `docs/CREATIVE_REVIEW.md`.
