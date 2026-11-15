# Revue créative du pipeline — 15 novembre 2026

État : **aperçu personnel produit, évaluation humaine en attente, HD personnel non exporté**. Aucun résultat de test ne vaut approbation artistique.

## Travail réutilisé et changements

Le point de départ est `ee730d8`. Le générateur, l’atelier, les imports, les modèles, le SRT, les rendus Remotion, les ZIP et les tests existants sont conservés. La composition originale `PlantesBulles` et le véritable composant SnapCN restent disponibles. Le nouveau style cinématique emploie ses propres animations Remotion sobres ; il ne revendique pas un usage de SnapCN pour ces textes.

La production interdit les voix de démonstration et les illustrations implicites. Elle exige des ressources réelles, un script fourni ou le transcript du WAV, des sous-titres acoustiquement alignés ou réellement vérifiés, puis un accord portant sur l’aperçu exact. Les erreurs ne déclenchent aucun moteur de remplacement.

Le montage privilégie des plans réels, des cuts sur les groupes parlés, des mouvements de 3,5 %, une accroche unique, une signature finale et des sous-titres courts. Les cadrages et la correspondance avec les paroles restent des décisions créatives à inspecter, pas des qualités déduites de ffprobe.

## Aperçu personnel réellement rendu

- Voix : WAV de 15 s fourni par l’utilisateur, déclaré export Chatterbox. `engine: files`. Aucune synthèse, aucune modification du timbre, du rythme, des pauses ou du texte.
- Sous-titres : neuf groupes courts, recalés localement sur le signal avec PocketSphinx français. Le transcript fourni reste la référence ; aucune reconnaissance indépendante ni écoute perceptive automatisée revendiquée.
- Images : vraies photographies botaniques d’Ivan Fonin, dépôt `https://github.com/ivanfonin/cc0-photos`, commit `22be2e285db50193362e8ed06712b4146e714f6c`. Le README déclare CC0. Fichiers 19, 16, 11, 9 et 5 ; sources, droits et empreintes conservés dans le dossier privé de l’étude. Aucune personne photographiée choisie. Aucun téléchargement de rush utilisateur ni média personnel publié.
- Rendu : Remotion/Chromium système, 15,000 s, 720 × 1280, 30 fps, 450 images, vidéo H.264 et voix AAC. Décodage complet réussi. Les sept images extraites du vrai rendu ont été examinées visuellement.
- Fidélité audio mesurée : PCM de travail identique après conversion technique ; corrélation AAC/source 0,9999768 ; décalage résiduel 0 échantillon ; gain −0,0087 dB. Les mesures portent sur toute la piste, pas seulement son début. Elles ne constituent pas une écoute humaine.
- Page de revue examinée dans Chromium à 390 × 844 : vidéo de 15 s chargée, sept images extraites présentes, formulaire en attente, aucune erreur JavaScript ni débordement horizontal. Aucun bouton de validation n’a été utilisé pour cet aperçu personnel.

## Limites qui restent à juger

1. Ce sont des photos botaniques de test, pas les plantes ou rushs personnels de l’utilisateur. Les espèces photographiées ne sont pas vérifiées comme Alocasia.
2. Aucun plan réel d’aquarium ou de poisson n’est disponible dans cette étude. Les passages correspondants de la voix ne sont donc pas illustrés littéralement. Cette limite peut justifier de refuser l’aperçu malgré sa qualité technique.
3. Les mouvements viennent de photos avec un zoom limité ; ce ne sont pas des mouvements de caméra filmés. Des plans vidéo réels donneront un autre rythme.
4. L’accroche graphique est revue, mais les paroles du WAV restent inchangées. Une meilleure accroche orale exige un nouveau script validé et un nouvel export vocal, pas des coupes ou silences artificiels.
5. Le runtime Chatterbox personnalisé, ses réglages réellement utilisés et sa référence vocale ne sont pas accessibles. L’import du WAV fonctionne ; l’inférence native n’est pas intégrée ni testée ici.
6. Le téléchargement local est testé par HTTP. Aucun hébergement privé externe ni test sur un iPhone physique n’est disponible dans cette session. Les fichiers du workspace doivent être sauvegardés en privé par l’utilisateur.
7. Le niveau du WAV source est faible : l’aperçu mesure −32,2 LUFS intégrés, avec une crête à −12,61 dBTP. Son niveau a été conservé pour cette évaluation fidèle ; aucun mastering de volume n’est appliqué. Ce point doit être écouté sur téléphone et résolu avant de considérer le film prêt à diffuser.

Les fichiers personnels, leur transcript, leurs rapports détaillés et l’archive restent ignorés par Git. Aucun film personnel n’est ajouté à `deliverables/`, à une release ou à un dépôt externe.

## Vérifications exécutées

`npm run typecheck` et `npm test` : **36 tests réussis, aucun échec ni test ignoré**.

La suite conserve les tests du générateur et du navigateur mobile, puis vérifie les nouveaux refus de substitutions, les ressources absentes, le calage, les groupes courts, l’absence de remplissage artificiel, la fidélité audio et le rejet d’une atténuation de 3 dB ou d’une coupure. Elle couvre les accords périmés après changement du projet, de l’aperçu ou des médias.

Le test complet de production emploie une image et un signal explicitement synthétiques, jamais présentés comme une voix Chatterbox : panne injectée à `captions`, reprise sans refaire la voix, aperçu 720 × 1280, HD bloquée sans accord, refus de la mauvaise empreinte, accord explicite limité à cette fixture, export HD 1080 × 1920, décodage, fidélité audio, absence de réexport au nouvel appel, ZIP et téléchargements protégés. Les requêtes vidéo partielles renvoient 206 ; les accès sans jeton sont refusés. L’ancien parcours démo conserve ses tests de réparation/restauration ZIP.

Cette suite valide le fonctionnement. La décision sur l’identité Plantes & Bulles, le plaisir d’écoute et la pertinence des images appartient à la revue de l’aperçu personnel.
