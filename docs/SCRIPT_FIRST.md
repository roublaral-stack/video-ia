# Script First : préparer le montage, importer la voix ensuite

Le script validé est l’entrée du nouveau workflow. Ni WAV, ni SRT, ni runtime Chatterbox, ni clé ElevenLabs ne sont nécessaires pour commencer. VIDEO IA ne synthétise pas la voix dans ce parcours. Les anciens moteurs et configurations restent disponibles pour compatibilité, uniquement dans leur parcours historique explicitement configuré.

## Configuration minimale

Copier `reel/pipeline-config/script-first.example.json` sous `reel/private/`, puis adapter les textes, les chemins et la direction :

```json
{
  "version": 1,
  "subject": "Un détail à observer",
  "template": "vlog",
  "duration": 15,
  "script": {
    "text": "Regardez cette feuille. Sa lumière change au fil de la journée. Prenons le temps de regarder les détails.",
    "validated": true
  },
  "media": ["mon-reel/plan.jpg"],
  "creative": {
    "hook": "Regardez\nde plus près.",
    "intention": "Photographie réelle, cadrage précis, mouvement léger et textes discrets."
  }
}
```

Les chemins sont relatifs au fichier JSON. `validated: true` signifie que le script fourni a réellement été validé, sans demande de réécriture automatique. Les trois modèles `educatif`, `vlog`, `application` et les durées de départ 15/30/60 sont conservés. Brag reste optionnel et réservé à Application.

Omettre `narration` équivaut à `{"engine":"none"}`. La présence d’un script avec `engine: demo` ou `chatterbox` est refusée, même avec les anciennes exceptions : aucune synthèse ne peut être activée implicitement dans Script First.

```bash
cd /workspace/video-ia/reel
npm run produce -- private/mon-reel.private.json --dry-run
npm run produce -- private/mon-reel.private.json
```

Le dry-run n’écrit ni configuration dérivée, ni projet, ni rendu. Le premier aperçu est un vrai rendu Remotion 720 × 1280 à 30 fps. Sans musique, il ne contient **aucune piste audio**, même si les rushs en contiennent : leur son est coupé comme dans le générateur existant.

## Sous-titres provisoires et réglages

Les groupes contiennent 2 à 5 mots, sans perte, réécriture ni changement d’ordre. Le découpage tient compte de la ponctuation et évite un dernier groupe d’un seul mot. Un script trop court ou trop dense pour ces contraintes provoque un diagnostic.

Les timings sont répartis selon la charge de lecture du texte : **ce sont des estimations de lecture, pas des mesures de voix**. L’aperçu et sa page de revue les identifient comme provisoires. Le projet porte `captionTiming: provisional`; `captions.timing.json` indique `synchronized: false`; le fichier à éditer est nommé **`captions.provisional.srt`**. `captions.srt` reste la copie canonique pour compatibilité.

Pour régler le découpage et les animations tout en conservant le style du dernier aperçu :

```json
{
  "subtitles": {
    "minWords": 2,
    "maxWords": 5,
    "maxChars": 52,
    "groups": [
      "Regardez cette feuille.",
      "Sa lumière change",
      "au fil de la journée.",
      "Prenons le temps",
      "de regarder les détails."
    ],
    "animation": {
      "mode": "subtle",
      "fadeInFrames": 2,
      "fadeOutFrames": 0,
      "riseFrames": 3,
      "risePx": 7
    }
  }
}
```

`groups` est facultatif : sans ce champ, le découpage est automatique. Les groupes manuels doivent reprendre **exactement** le script. Les animations proposent `subtle`, `fade` ou `none`; les durées sont en images à 30 fps. Les valeurs par défaut conservent l’apparition et le mouvement discrets du dernier aperçu.

Pour éditer les timings provisoires, copier le SRT généré sous `private/`, puis renseigner `subtitles.srt` dans la configuration et relancer `produce`. Ne pas modifier directement un checkpoint : ses empreintes feraient régénérer la sortie. Le SRT édité doit conserver les mots du script et des groupes de 2 à 5 mots, sans chevauchement et dans la durée du montage. Ses timings restent provisoires.

À l’import de la voix, le découpage manuel, y compris celui d’un `subtitles.srt`, est conservé, mais **ses timings sont recalculés sur l’audio**. Aucun timing de lecture antérieur n’est considéré comme synchronisé.

Le découpage automatique peut être rééquilibré à cette étape selon les durées réelles des mots : il pénalise les groupes trop brefs ou trop rapides à lire. Les choix manuels restent prioritaires. Ce changement de découpage fait partie de la nouvelle version à revoir.

## Musique facultative pour l’aperçu

```json
{"music":{"audio":"mon-reel/musique-autorisee.mp3","volume":0.12,"loop":false}}
```

Choisir un fichier disponible et autorisé ; aucun catalogue distant n’est appelé. La musique ne rend pas les sous-titres synchronisés. Elle est réservée à l’étude sans voix : lors de l’import vocal, le pipeline retire cette musique de la configuration dérivée et le signale. Le nouvel aperçu permet ainsi de contrôler la fidélité de la voix seule. Un mix musical final avec mastering n’est pas implémenté dans cette évolution.

## Validation du montage sans voix

L’aperçu, ses images extraites, son SRT et son **ZIP privé rééditable** sont téléchargeables avant validation. L’accord sur le montage peut être donné dans la page locale `/production/IDENTIFIANT` ou avec :

```bash
npm run produce -- private/mon-reel.private.json \
  --approve-preview EMPREINTE_RETOURNEE \
  --review-note "Mon avis sur ce montage et ses sous-titres provisoires."
```

Le statut devient `awaiting_audio`. Cet accord a la portée `montage-only-provisional` et **ne lance jamais la HD de finalisation**. Il ne peut pas autoriser le rendu d’une future version avec voix. Il est également possible d’importer l’audio avant cet accord : la nouvelle version demandera dans tous les cas sa propre revue.

## Import ElevenLabs par fichiers, sans synthèse intégrée

Produire la voix à l’extérieur de VIDEO IA avec le script validé. Puis :

```bash
npm run setup:alignment  # une fois, uniquement pour le calage sur la voix
npm run produce -- private/mon-reel.private.json \
  --audio private/mon-reel/voix.wav --origin elevenlabs-export
# MP3 accepté de la même manière.
```

`--origin elevenlabs-export` est une provenance déclarée, **pas une intégration API ElevenLabs**. Sans ce drapeau, l’origine est `provided-recording`, sans attribution inventée. Aucun jeton ElevenLabs, appel de synthèse ou transfert d’audio vers un service n’est effectué.

La commande crée une **nouvelle configuration privée** `*.audio-....private.json`, dont elle retourne le chemin. Elle conserve le script, les médias, les réglages de sous-titres et la direction, sans écraser la configuration initiale. Même audio et même configuration donnent la même version ; un fichier dérivé modifié manuellement n’est pas écrasé.

Le WAV/MP3 original reste intact. Son import ne change ni hauteur, ni tempo, ni pauses, ni niveau ; le PCM technique et l’AAC de livraison sont contrôlés par comparaison avec son décodage de référence. La compression AAC reste avec perte. Un gain ou mixage final peut être envisagé séparément après évaluation, sans prétendre qu’il a déjà été réalisé.

Le moteur local PocketSphinx français aligne le **script fourni** sur les vrais échantillons audio, mot à mot. Les sous-titres sont reconstruits selon ces horodatages et les groupes choisis. Aucun SRT n’est nécessaire. Ce n’est pas une reconnaissance indépendante des mots : le script doit correspondre à ce qui est réellement prononcé. Un mot absent du lexique demande une prononciation française vérifiée ; les nombres doivent être écrits en toutes lettres pour cet aligneur. Un échec de modèle, de runtime ou de calage arrête cette étape, sans substitution vocale ni retour aux timings provisoires.

La durée du projet suit l’enregistrement, arrondie à l’image supérieure à 30 fps. Exemple : 16,4 s de voix deviennent un montage de 492 images, même si la durée initialement visée était 15 s. Le champ `requestedDuration` conserve cette cible ; `durationPolicy: audio` identifie la durée effective. Il n’y a ni accélération, ni découpe de la voix, ni silence ajouté pour atteindre artificiellement la durée nominale.

Les coupes sont recalculées aux limites acoustiques des phrases ou propositions ponctuées ; la voix reste continue. Les anciens plans explicites servent de choix de médias/cadrages/mouvements dans ce recalage, mais leurs anciennes secondes ne sont pas réutilisées aveuglément. `narration.retimeShots: false` permet de fournir ensuite un storyboard explicitement ajusté à la nouvelle durée. Une vidéo trop courte pour le plan proposé provoque un diagnostic : pas de boucle ou coupe de phrase automatique pour masquer le problème.

La nouvelle production revient à `awaiting_review`, avec `captions.aligned.srt` et un nouveau MP4 contenant la véritable voix. Les anciens accords ne sont pas transférés. Un changement de projet, média, timings, animation ou rendu rend également l’accord correspondant caduc. Après écoute et contrôle des images, utiliser la **configuration audio retournée** et sa nouvelle empreinte pour autoriser la HD.

## Reprise, sauvegarde et contrôles

Relancer la même commande, ou directement le chemin de configuration audio retourné. Les étapes intactes sont réutilisées. Le checkpoint indique l’étape en échec et sa commande de reprise ; une panne de sous-titres n’exige pas de réimporter les médias ou la voix. `--from preview` permet de refaire un aperçu volontairement.

Le ZIP d’aperçu comme le ZIP final utilisent le format existant `project.json` + médias + documents `production/`. Ils contiennent le statut des timings et les réglages d’animation. Restauration :

```bash
npm run project -- restore projects/repris.json /chemin/sources-privees.zip
```

Ces archives contiennent vos médias et éventuellement votre voix : les sauvegarder **en privé**, jamais dans GitHub. Les répertoires privés, imports, checkpoints et rendus restent ignorés par Git. Le commit restaure le générateur et les exemples génériques, pas les fichiers personnels. Les dépôts Brag et Voix off restent inchangés.

Tests reproductibles :

```bash
npm run typecheck
npm test
# Contrôle additionnel avec un enregistrement EXISTANT et privé :
npm run test:script-first:import -- private/config.private.json private/voix.wav
```

Le contrôle additionnel ne synthétise rien et ne valide pas l’aperçu personnel. Il vérifie successivement la préparation sans voix, l’import et le calage acoustique, la fidélité du son, le refus de l’ancienne empreinte, la reprise sans nouveau rendu et le maintien du blocage HD. Ses résultats détaillés sont écrits uniquement sous `private/`.

## Validation réalisée

- TypeScript valide ; **42 tests réussis**, aucun échec ni test ignoré. Les exports des suites sont limités à deux suites simultanées pour respecter les délais de l’atelier cloud ; son test nettoie également ses processus de rendu en cas d’interruption.
- Préparation séparée sans voix : véritable MP4 Remotion de **30 s**, 720 × 1280, 900 images, **aucune piste audio**, SRT provisoire et ZIP rééditable. La musique facultative est testée séparément avec un signal non verbal explicitement synthétique, sans moteur de voix.
- Finalisation privée par WAV : enregistrement déjà fourni, sans SRT d’entrée, script aligné par PocketSphinx, **15 s / 450 images**, huit groupes de 2 à 5 mots. Le montage suit ainsi l’audio plutôt que la cible de 30 s. Fidélité mesurée : corrélation 0,9999768, gain −0,0087 dB, décalage 0 échantillon ; aucune coupure, aucun changement de voix.
- Finalisation privée par MP3 : copie compressée locale du même WAV, utilisée uniquement comme fichier de test ; **15,067 s / 452 images**, incluant l’arrondi des durées techniques MP3. Audio complet conservé, corrélation avec le décodage du MP3 0,9999749, gain −0,0100 dB et décalage 0 échantillon. Ce test ne prétend pas provenir d’un appel ElevenLabs.
- Les deux finalisations vérifient le refus de l’ancienne empreinte sans voix, la reprise sans nouveau rendu, ffprobe et le décodage intégral. Aucun accord artistique ni export HD personnel n’a été déclenché. Le rendu HD et son accord propre sont couverts par les tests automatisés avec leurs seules fixtures synthétiques.
- Édition d’un SRT provisoire vérifiée à la milliseconde ; modification des mots du script refusée. Les pages de revue finales ont été contrôlées dans Chromium à 390 × 844 : vidéos chargées, boutons de portée correcte et aucun débordement horizontal. Les images extraites des vrais rendus ont été inspectées.

Limites de l’étude : photos botaniques CC0 déjà utilisées dans le projet, sans rush personnel ni aquarium ; niveau du WAV d’origine faible et conservé. Le calage acoustique suppose un transcript exact et reste à écouter. L’import ElevenLabs fonctionne par fichiers ; aucune API ou synthèse ElevenLabs n’est intégrée. Aucun média, enregistrement, transcript ou rapport personnel n’est publié dans GitHub.
